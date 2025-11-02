import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { appendFile, mkdir } from "fs/promises"


const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const originalConsole = { ...console };

// 自定义颜色
const colors = {
    reset: "\x1b[0m",
    red: "\x1b[31m",
    yellow: "\x1b[33m",
    cyan: "\x1b[36m",
    grey: "\x1b[38;5;250m",
    white: "\x1b[37m",
    green: "\x1b[32m"
};

const config = {
    debug: process.env.NODE_ENV === 'production' ? false : true
}

// 日志文件路径
const LOG_DIR = join(__dirname, "../../logs");

// 获取当前日期的日志文件名
function getLogFilePath() {
    return join(LOG_DIR, `${new Date().toISOString().split('T')[0]}.log`);
}

// 确保日志目录存在
async function ensureLogDir() {
    try {
        await mkdir(LOG_DIR, { recursive: true });
    } catch (err) {
        originalConsole.error("Failed to create log directory:", err);
    }
}

// 异步写入日志文件
async function writeToFile(level, message) {
    await ensureLogDir();
    const logMessage = `${new Date().toISOString()} [${level}] ${message}\n`;
    const logFile = getLogFilePath();
    await appendFile(logFile, logMessage, { flag: "a" });
}

function getCurrentTimestamp(name) {
    const now = new Date();
    return `[${now.toISOString().replace("T", " ").slice(0, 19)} ${name}]`; // YYYY-MM-DD HH:mm:ss
}

console.error = (...args) => {
    const callerFile = getCallFile();
    const message = args.join(" ");
    originalConsole.error(colors.red, callerFile, getCurrentTimestamp("ERROR"), ...args, colors.reset);
    writeToFile("ERROR", message).catch(err => originalConsole.error("Failed to write to log file:", err));
};

console.warn = (...args) => {
    const callerFile = getCallFile();
    const message = args.join(" ");
    originalConsole.warn(colors.yellow, callerFile, getCurrentTimestamp("WARN"), ...args, colors.reset);
    writeToFile("WARN", message).catch(err => originalConsole.error("Failed to write to log file:", err));
};

console.info = (...args) => {
    const callerFile = getCallFile();
    originalConsole.info(colors.green, callerFile, getCurrentTimestamp("INFO"), ...args, colors.reset);
};

console.debug = (...args) => {
    const callerFile = getCallFile();
    if (config.debug)
        originalConsole.debug(colors.cyan, callerFile, getCurrentTimestamp("DEBUG"), ...args, colors.reset);
}

console.log = (...args) => {
    const callerFile = getCallFile();
    if (config.debug)
        originalConsole.log(colors.grey, callerFile, getCurrentTimestamp("LOG"), ...args, colors.reset);
}

function getCallFile() {
    const err = new Error();
    let callerFile = '';

    // 使用 V8 stack trace API 获取调用栈对象
    const origPrepareStackTrace = Error.prepareStackTrace;
    Error.prepareStackTrace = (_, stackFrames) => stackFrames;
    const stackFrames = err.stack;
    Error.prepareStackTrace = origPrepareStackTrace;
    if (stackFrames && stackFrames.length >= 3) {
        // 第0行：Error
        // 第1行：console.info override
        // 第2行：真正的调用者
        const frame = stackFrames[2];
        callerFile = frame.getFileName()?.split('/').pop() || '';
        callerFile = `[${callerFile}]`;
    }
    return callerFile;
}