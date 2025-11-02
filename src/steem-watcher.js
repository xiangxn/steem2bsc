import { Client, PrivateKey } from 'dsteem';
import fs from 'fs/promises';
import EventEmitter from 'events';

export class SteemWatcher extends EventEmitter {
    constructor({
        account,
        activeKey,
        memoRegex = /^.+$/,
        nodeUrl = 'https://api.justyy.com',
        lastBlockFile = 'last_steem_block.txt',
        confirmBlocks = 0  // 可选延迟确认模式
    }) {
        super();
        this.account = account;
        this.activeKey = activeKey;
        this.memoRegex = memoRegex;
        this.client = new Client(nodeUrl, { timeout: 8000 });
        this.lastBlockFile = `${process.cwd()}/${lastBlockFile}`;
        this.confirmBlocks = confirmBlocks;
        this.running = false;

        // 👇 注册事件监听转账请求
        this.on('transfer', async (tx) => {
            try {
                await this.transfer(tx.to, tx.amount, tx.memo);
            } catch (err) {
                console.error('transferError', err);
            }
        });
    }

    async saveLastBlock(num) {
        await fs.writeFile(this.lastBlockFile, String(num));
    }

    async loadLastBlock() {
        try {
            const data = await fs.readFile(this.lastBlockFile, 'utf8')
            return parseInt(data, 10);
        } catch {
            return null;
        }
    }

    // 发起转账（可以直接调用或通过 emit('transfer')）
    async transfer(to, amount, memo = '') {
        if (!this.activeKey) throw new Error('Active key required for transfer');
        const privKey = PrivateKey.fromString(this.activeKey);

        const op = [
            'transfer',
            {
                from: this.account,
                to,
                amount,
                memo
            }
        ];

        try {
            const result = await this.client.broadcast.sendOperations([op], privKey);
            console.info(`💸 Transfer sent: ${amount} to ${to} | memo="${memo}"`);
            return result;
        } catch (err) {
            console.error(`🚨 Transfer failed: ${err.message}`);
        }
    }

    async start() {
        if (this.running) return;
        this.running = true;

        console.info(`🔍 Watching Steem account: ${this.account}`);

        let lastBlock = await this.loadLastBlock();
        if (!lastBlock) {
            const props = await this.client.database.getDynamicGlobalProperties();
            lastBlock = props.head_block_number;
            await this.saveLastBlock(lastBlock);
        }

        while (this.running) {
            try {
                const props = await this.client.database.getDynamicGlobalProperties();
                const headBlock = props.head_block_number;

                while (lastBlock < headBlock - this.confirmBlocks) {
                    lastBlock++;
                    const block = await this.client.database.getBlock(lastBlock);
                    if (!block) continue;

                    for (const tx of block.transactions) {
                        for (const op of tx.operations) {
                            if (op[0] === 'transfer') {
                                const data = op[1];
                                if (
                                    data.to === this.account &&
                                    data.memo &&
                                    this.memoRegex.test(data.memo)
                                ) {
                                    this.emit('deposit', {
                                        sourceChain: 'steem',
                                        from: data.from,
                                        amount: data.amount,
                                        memo: this.getMemoInfo(data.memo),
                                        txid: tx.transaction_id,
                                        blockNum: lastBlock,
                                        timestamp: block.timestamp
                                    });
                                }
                            }
                        }
                    }

                    await this.saveLastBlock(lastBlock);
                    // await new Promise(r => setTimeout(r, 1000));
                }
            } catch (err) {
                await new Promise(r => setTimeout(r, 5000));
            }

            await new Promise(r => setTimeout(r, 3000));
        }
        console.info('🛑 SteemWatcher stopped.');
    }

    stop() {
        this.running = false;
    }

    getMemoInfo(memo) {
        const match = memo.match(this.memoRegex)
        if (match) {
            return {
                chain: match[1],
                to: match[2]
            }
        }
        return null
    }
}


