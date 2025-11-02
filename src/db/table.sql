CREATE DATABASE IF NOT EXISTS steem2bsc
CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;

USE steem2bsc;

-- 创建交易记录表
CREATE TABLE IF NOT EXISTS transactions (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    from_account VARCHAR(100) NOT NULL COMMENT '发送方账户',
    amount DECIMAL(20,8) NOT NULL COMMENT '转账金额',
    symbol VARCHAR(10) NOT NULL COMMENT '币种符号',
    source_chain VARCHAR(10) NOT NULL COMMENT '源链类型',
    target_chain VARCHAR(10) NOT NULL COMMENT '目标链类型',
    to_address VARCHAR(100) NOT NULL COMMENT '接收方地址',
    txid VARCHAR(256) NOT NULL UNIQUE COMMENT '交易ID',
    block_num BIGINT NOT NULL COMMENT '区块号',
    timestamp DATETIME NOT NULL COMMENT '时间戳',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    
    INDEX idx_from_account (from_account),
    INDEX idx_to_address (to_address),
    INDEX idx_txid (txid),
    INDEX idx_block_num (block_num),
    INDEX idx_timestamp (timestamp),
    INDEX idx_source_chain (source_chain),
    INDEX idx_target_chain (target_chain),
    INDEX idx_symbol (symbol)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='跨链交易记录表';

-- 创建交易状态表（用于跟踪交易处理状态）
CREATE TABLE IF NOT EXISTS transaction_status (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    transaction_id BIGINT NOT NULL COMMENT '交易记录ID',
    status ENUM('pending', 'processing', 'completed', 'failed') DEFAULT 'pending' COMMENT '处理状态',
    error_message TEXT COMMENT '错误信息',
    retry_count INT DEFAULT 0 COMMENT '重试次数',
    last_retry_time TIMESTAMP NULL COMMENT '最后重试时间',
    completed_time TIMESTAMP NULL COMMENT '完成时间',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    
    FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE,
    INDEX idx_status (status),
    INDEX idx_transaction_id (transaction_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='交易处理状态表';