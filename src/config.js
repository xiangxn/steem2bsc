import { Encryptor } from './utils/encryptor.js';
import * as readlineSync from 'readline-sync';

let encryptor

export function initEncryptor() {
    // Get password from CLI input (hidden)
    const password = readlineSync.question('Enter encryption password: ', {
        hideEchoBack: true
    });
    if (!password) {
        console.error('Password is required');
        process.exit(1);
    }
    encryptor = new Encryptor(password)
}

export const getConfig = () => {
    return {
        // 数据库
        MYSQL_HOST: process.env.MYSQL_HOST || '127.0.0.1',
        MYSQL_PORT: process.env.MYSQL_PORT || '3306',
        MYSQL_USER: process.env.MYSQL_USER || 'root',
        MYSQL_PASS: encryptor.decrypt(process.env.MYSQL_PASS || ''),
        MYSQL_DATABASE: process.env.MYSQL_DATABASE || 'steem2bsc',

        // steem
        LISTEN_STEEM_ACCOUNT: process.env.LISTEN_STEEM_ACCOUNT || 'nutbox',
        LISTEN_STEEM_PRI: encryptor.decrypt(process.env.LISTEN_STEEM_PRI || ''),

        // bsc
        LISTEN_EVM_RPC_URL: process.env.LISTEN_EVM_RPC_URL || 'https://binance.nodereal.io/',
        LISTEN_BSC_CONTRACT: process.env.LISTEN_BSC_CONTRACT || '0x0000000000000000000000000000000000000000',
        LISTEN_BSC_ACCOUNT: process.env.LISTEN_BSC_ACCOUNT || '0x0000000000000000000000000000000000000000',
        LISTEN_BSC_PRI: encryptor.decrypt(process.env.LISTEN_BSC_PRI || ''),
    }
}