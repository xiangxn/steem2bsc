import { EventEmitter } from 'events';
import fs from 'fs/promises';
import { ethers } from 'ethers';
import abi from './abi/abi.json' with { type: 'json' };

export class EvmWatcher extends EventEmitter {
    constructor({
        rpcUrl,
        contractAddress,
        minterAddress,
        minterPri,
        sourceChain = 'bsc',
        confirmBlocks = 3,
        intervalMs = 10_000,
        lastBlockFile = 'last_evm_block.txt'
    }) {
        super();
        this.rpcUrl = rpcUrl;
        this.contractAddress = contractAddress;
        this.abi = abi;
        this.lastBlockFile = `${process.cwd()}/${lastBlockFile}`;
        this.provider = new ethers.JsonRpcProvider(this.rpcUrl);
        this.contract = new ethers.Contract(contractAddress, this.abi, this.provider);
        this.polling = false;
        this.confirmBlocks = confirmBlocks;
        this.intervalMs = intervalMs;
        this.minterAddress = minterAddress;
        this.wallet = new ethers.Wallet(minterPri, this.provider);
        this.sourceChain = sourceChain;

        // 🔁 监听来自外部的 transfer 事件
        this.on('transfer', async payload => {
            try {
                await this.transfer(payload);
            } catch (err) {
                console.error('[EVM] transfer() error:', err.message);
            }
        });
    }

    async getLastBlock() {
        try {
            const data = await fs.readFile(this.lastBlockFile, 'utf8');
            return parseInt(data.trim(), 10);
        } catch {
            return null
        }
    }

    async saveLastBlock(blockNum) {
        await fs.writeFile(this.lastBlockFile, String(blockNum), 'utf8');
    }

    async start() {
        if (this.polling) return;
        this.polling = true;
        console.info(`🔍 Watching BSC contract: ${this.contractAddress}`);

        let lastBlock = await this.getLastBlock();
        if (!lastBlock) {
            lastBlock = await this.provider.getBlockNumber()
            await this.saveLastBlock(lastBlock)
        }

        while (this.polling) {
            try {
                const headBlock = await this.provider.getBlockNumber();

                while (lastBlock < headBlock - this.confirmBlocks) {
                    lastBlock++;
                    const block = await this.provider.getBlock(lastBlock, true);
                    if (!block) continue;

                    if (block.transactions) {
                        for (const txHash of block.transactions) {
                            try {
                                const receipt = await this.provider.getTransactionReceipt(txHash);
                                if (!receipt || receipt.to?.toLowerCase() !== this.contractAddress.toLowerCase()) continue;

                                for (const log of receipt.logs) {
                                    try {
                                        const parsed = this.contract.interface.parseLog(log);
                                        if (parsed && parsed.name === 'TagAISteemToSteem') {
                                            const { steemAccount, user, amount } = parsed.args
                                            this.emit('deposit', {
                                                sourceChain: this.sourceChain,
                                                from: user,
                                                amount: `${ethers.formatEther(amount)} TAGAISTEEM`,
                                                memo: { chain: 'steem', to: steemAccount },
                                                txid: txHash,
                                                blockNum: lastBlock,
                                                timestamp: new Date(block.timestamp * 1000).toISOString()
                                            });
                                        }
                                    } catch { }
                                }
                            } catch { }
                        }
                    }
                    await this.saveLastBlock(lastBlock);
                }
            } catch (err) {
                console.error('[EVM] Error:', err.message);
            }

            await new Promise(r => setTimeout(r, this.intervalMs));
        }
        console.info('[EVM] Listener stopped');
    }

    stop() {
        this.polling = false;
    }

    /**
     * 🔁 transfer 方法：可以是模拟执行、广播交易或触发上层回调。
     * 外部 emit('transfer', { ... }) 会自动调用此方法。
     */
    async transfer({ steemAccount, toAddress, amount }) {
        const contractWithSigner = this.contract.connect(this.wallet);
        const value = ethers.parseEther(amount)
        try {
            const tx = await contractWithSigner.steemToTsteem(steemAccount, toAddress, value)
            await tx.wait(this.confirmBlocks ?? 1);
            console.info(`💸 Transfer sent: ${amount} to ${toAddress} | memo="${steemAccount}"`);
        } catch (err) {
            console.error(`🚨 Transfer failed: ${err.message}`);
        }

    }
}

export function assetFromString(amount) {
    const [amountStr, symbol] = amount.split(' ');
    return { amount: parseFloat(amountStr), symbol }
}
