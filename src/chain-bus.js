import { SteemWatcher } from './steem-watcher.js';
import { EvmWatcher, assetFromString } from './evm-watcher.js'
import { getConfig } from './config.js';
import { Asset } from 'dsteem'
import { Database } from "./db/database.js";

export class ChainBus {
    constructor() {
        this.config = getConfig();
        console.log(this.config)
        this.steemWatcher = null;
        this.evmWatcher = null;
        this.database = new Database();
        this.isRunning = false;

        // 绑定事件处理器
        this.handleDeposit = this.handleDeposit.bind(this);
    }

    /**
     * 启动链总线管理器
     */
    async start() {
        if (this.isRunning) {
            console.warn('⚠️ ChainBus 已经在运行中');
            return;
        }

        try {
            // 初始化数据库连接
            console.debug('🔗 连接数据库...');
            await this.database.connect();

            // 检查数据库健康状态
            const dbHealthy = await this.database.healthCheck();
            if (!dbHealthy) {
                throw new Error('数据库连接失败');
            }
            console.debug('✅ 数据库连接成功');

            // 初始化 SteemWatcher
            console.info('🔍 初始化 Steem 监听器...');
            this.steemWatcher = new SteemWatcher({
                account: this.config.LISTEN_STEEM_ACCOUNT,
                activeKey: this.config.LISTEN_STEEM_PRI,
                memoRegex: /^(bsc):(0x[a-fA-F0-9]{40})$/,
                confirmBlocks: 2
            });

            // 初始化 EvmWatcher
            this.evmWatcher = new EvmWatcher({
                rpcUrl: this.config.LISTEN_EVM_RPC_URL,
                contractAddress: this.config.LISTEN_BSC_CONTRACT,
                minterAddress: this.config.LISTEN_BSC_ACCOUNT,
                minterPri: this.config.LISTEN_BSC_PRI
            })

            // 注册事件监听器
            this.registerEventHandlers();

            // 启动 SteemWatcher
            this.steemWatcher.start();
            // 启动 EvmWatcher
            this.evmWatcher.start();

            this.isRunning = true;

            console.info('🚀 ChainBus 启动成功');

        } catch (error) {
            console.error('❌ ChainBus 启动失败:', error.message);
            await this.cleanup();
            throw error;
        }
    }

    /**
     * 停止链总线管理器
     */
    async stop() {
        if (!this.isRunning) {
            console.warn('⚠️ ChainBus 未在运行');
            return;
        }

        try {
            console.info('🛑 正在停止 ChainBus...');

            this.isRunning = false;

            this.removeEventHandlers();

            // 停止 SteemWatcher
            if (this.steemWatcher) {
                this.steemWatcher.stop();
                this.steemWatcher = null;
            }

            // 停止 EvmWatcher
            if (this.evmWatcher) {
                this.evmWatcher.stop();
                this.evmWatcher = null;
            }

            // 断开数据库连接
            if (this.database) {
                await this.database.disconnect();
            }

            console.info('✅ ChainBus 已停止');

        } catch (error) {
            console.error('❌ ChainBus 停止过程中出错:', error.message);
            throw error;
        }
    }

    /**
     * 注册事件处理器
     */
    registerEventHandlers() {
        if (!this.steemWatcher) return;

        this.steemWatcher.on('deposit', this.handleDeposit);
        this.evmWatcher.on('deposit', this.handleDeposit);

        console.info('📡 事件监听器已注册');
    }

    /**
     * 移除事件处理器
     */
    removeEventHandlers() {
        if (this.steemWatcher) {
            this.steemWatcher.off('deposit', this.handleDeposit);
        }

        if (this.evmWatcher) {
            this.evmWatcher.off('deposit', this.handleDeposit);
        }

        console.info('📡 事件监听器已移除');
    }

    /**
     * 处理存款事件
     */
    async handleDeposit(tx) {
        try {
            console.debug('💰 检测到存款:', {
                from: tx.from,
                amount: tx.amount,
                sourceChain: tx.sourceChain,
                targetChain: tx.memo.chain,
                toAddress: tx.memo.to
            });

            // 保存交易记录到数据库
            const asset = tx.sourceChain === 'steem' ? Asset.fromString(tx.amount) : assetFromString(tx.amount)
            const result = await this.database.insertTransaction({
                from_account: tx.from,
                amount: asset.amount,
                symbol: asset.symbol,
                source_chain: tx.sourceChain,
                target_chain: tx.memo.chain,
                to_address: tx.memo.to,
                txid: tx.txid,
                block_num: tx.blockNum,
                timestamp: tx.timestamp
            });

            if (result.success) {
                console.info('✅ 交易记录保存成功, ID:', result.insertId);

                // 触发跨链转账
                switch (tx.memo.chain) {
                    case 'bsc':
                        this.evmWatcher.emit('transfer', { steemAccount: tx.from, toAddress: tx.memo.to, amount: asset.amount.toString() })
                        break;
                    case 'steem':
                        this.steemWatcher.emit('transfer', { to: tx.memo.to, amount: Asset.from(asset.amount), memo: tx.from })
                        break;
                    default:
                        break;
                }

            } else if (result.code === 'DUPLICATE_ENTRY') {
                console.warn('⚠️ 交易记录已存在，跳过处理');
            } else {
                console.error('❌ 交易记录保存失败:', result.error);
            }

        } catch (error) {
            console.error('❌ 处理存款事件失败:', error.message);
        }
    }

    /**
     * 清理资源
     */
    async cleanup() {
        try {
            if (this.steemWatcher) {
                this.steemWatcher.stop();
                this.removeEventHandlers();
                this.steemWatcher = null;
            }

            await database.disconnect();
            this.isRunning = false;

        } catch (error) {
            console.error('清理资源时出错:', error.message);
        }
    }

    /**
     * 获取运行状态
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            databaseConnected: !!database.connection,
            steemWatcherRunning: this.steemWatcher?.running || false
        };
    }

    /**
     * 健康检查
     */
    async healthCheck() {
        try {
            const dbHealthy = await database.healthCheck();
            const status = this.getStatus();

            return {
                healthy: dbHealthy && status.databaseConnected,
                database: dbHealthy,
                steemWatcher: status.steemWatcherRunning,
                status: status
            };
        } catch (error) {
            return {
                healthy: false,
                database: false,
                steemWatcher: false,
                error: error.message
            };
        }
    }
}