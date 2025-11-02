import mysql from 'mysql2/promise';

import { getConfig } from '../config.js';

export class Database {
    constructor() {
        const config = getConfig()
        this.connection = null;
        this.config = {
            host: config.MYSQL_HOST,
            port: config.MYSQL_PORT,
            user: config.MYSQL_USER,
            password: config.MYSQL_PASS,
            database: config.MYSQL_DATABASE,
            charset: 'utf8mb4',
            connectionLimit: 10,
            connectTimeout: 60000, // ✅ 连接超时时间（毫秒）
            waitForConnections: true, // ✅ 当连接池满时是否等待
            queueLimit: 0 // ✅ 允许无限排队等待
        };
    }

    /**
     * 连接数据库
     */
    async connect() {
        try {
            this.connection = await mysql.createPool(this.config);
            console.log('✅ 数据库连接成功');
            return this.connection;
        } catch (error) {
            console.error('❌ 数据库连接失败:', error.message);
            throw error;
        }
    }

    /**
     * 断开数据库连接
     */
    async disconnect() {
        if (this.connection) {
            await this.connection.end();
            console.info('🔌 数据库连接已断开');
        }
    }

    /**
     * 插入交易记录
     * @param {Object} transactionData 交易数据
     * @returns {Promise<Object>} 插入结果
     */
    async insertTransaction(transactionData) {
        const {
            from_account,
            amount,
            symbol,
            source_chain,
            target_chain,
            to_address,
            txid,
            block_num,
            timestamp
        } = transactionData;

        const query = `
            INSERT INTO transactions 
            (from_account, amount, symbol, source_chain, target_chain, to_address, txid, block_num, timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const values = [
            from_account,
            parseFloat(amount), // 确保是数字类型
            symbol,
            source_chain,
            target_chain,
            to_address,
            txid,
            block_num,
            new Date(timestamp)
        ];

        try {
            const [result] = await this.connection.execute(query, values);

            // 同时创建交易状态记录
            await this.createTransactionStatus(result.insertId);

            return {
                success: true,
                insertId: result.insertId,
                message: '交易记录插入成功'
            };
        } catch (error) {
            if (error.code === 'ER_DUP_ENTRY') {
                return {
                    success: false,
                    error: '交易记录已存在',
                    code: 'DUPLICATE_ENTRY'
                };
            }

            console.error('插入交易记录失败:', error);
            throw error;
        }
    }

    /**
     * 创建交易状态记录
     * @param {number} transactionId 交易ID
     * @returns {Promise<Object>}
     */
    async createTransactionStatus(transactionId) {
        const query = `
            INSERT INTO transaction_status (transaction_id)
            VALUES (?)
        `;

        try {
            const [result] = await this.connection.execute(query, [transactionId]);
            return {
                success: true,
                insertId: result.insertId
            };
        } catch (error) {
            console.error('创建交易状态记录失败:', error);
            throw error;
        }
    }

    /**
     * 更新交易状态
     * @param {number} transactionId 交易ID
     * @param {string} status 状态
     * @param {string} errorMessage 错误信息
     * @returns {Promise<Object>}
     */
    async updateTransactionStatus(transactionId, status, errorMessage = null) {
        const query = `
            UPDATE transaction_status 
            SET status = ?, error_message = ?, retry_count = retry_count + 1, last_retry_time = NOW()
            WHERE transaction_id = ?
        `;

        try {
            const [result] = await this.connection.execute(query, [status, errorMessage, transactionId]);
            return {
                success: true,
                affectedRows: result.affectedRows
            };
        } catch (error) {
            console.error('更新交易状态失败:', error);
            throw error;
        }
    }

    /**
     * 根据txid查询交易记录
     * @param {string} txid 交易ID
     * @returns {Promise<Object|null>}
     */
    async getTransactionByTxid(txid) {
        const query = `
            SELECT t.*, ts.status, ts.error_message, ts.retry_count
            FROM transactions t
            LEFT JOIN transaction_status ts ON t.id = ts.transaction_id
            WHERE t.txid = ?
        `;

        try {
            const [rows] = await this.connection.execute(query, [txid]);
            return rows[0] || null;
        } catch (error) {
            console.error('查询交易记录失败:', error);
            throw error;
        }
    }

    /**
     * 获取待处理的交易
     * @param {number} limit 限制数量
     * @returns {Promise<Array>}
     */
    async getPendingTransactions(limit = 10) {
        const query = `
            SELECT t.*, ts.id as status_id
            FROM transactions t
            INNER JOIN transaction_status ts ON t.id = ts.transaction_id
            WHERE ts.status = 'pending'
            ORDER BY t.timestamp ASC
            LIMIT ?
        `;

        try {
            const [rows] = await this.connection.execute(query, [limit]);
            return rows;
        } catch (error) {
            console.error('获取待处理交易失败:', error);
            throw error;
        }
    }

    /**
     * 检查数据库连接
     */
    async healthCheck() {
        try {
            const [rows] = await this.connection.execute('SELECT 1');
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * 执行原始SQL查询（用于调试）
     */
    async query(sql, params = []) {
        try {
            const [rows] = await this.connection.execute(sql, params);
            return rows;
        } catch (error) {
            console.error('SQL查询失败:', error);
            throw error;
        }
    }
}