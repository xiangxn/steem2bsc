import './utils/console.js'

import dotenv from 'dotenv'
dotenv.config()

import { initEncryptor } from "./config.js";
initEncryptor()

import { ChainBus } from './chain-bus.js'


async function main() {
    const chainBus = new ChainBus()
    process.on('SIGINT', async () => {
        console.info('\nSIGINT received — shutting down gracefully...');
        await chainBus.stop();
        process.exit(0);
    });
    
    chainBus.start()
}

main().catch(err => {
    console.error("main error:", err);
    process.exit(1);
});