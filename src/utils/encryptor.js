import crypto from 'crypto';

export class Encryptor {
    algorithm = 'aes-256-cbc';
    key;
    iv;

    constructor(password) {
        // Derive a 32-byte key and 16-byte IV from the password
        const hash = crypto.createHash('sha256').update(password).digest();
        this.key = hash;
        this.iv = Buffer.from(hash.subarray(0, 16));
    }

    encrypt(text) {
        const cipher = crypto.createCipheriv(this.algorithm, this.key, this.iv);
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return encrypted;
    }

    decrypt(encryptedText) {
        const decipher = crypto.createDecipheriv(this.algorithm, this.key, this.iv);
        let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }
}
