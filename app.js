// MEDINEST PHARMACY - Core Application Logic with Supabase Remote Integration
// Author: Antigravity AI Pair Programming

// --- SUPABASE CONFIGURATION ---
// Please paste your Supabase Project credentials below:
const SUPABASE_URL = 'https://wnonnczmmbywdetzktwb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indub25uY3ptbWJ5d2RldHprdHdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzOTk3OTIsImV4cCI6MjA5NTk3NTc5Mn0.gHptkBZgxbBtLrz6FZaPH56DMzZRQEpgYqrW_C2xkQQ';

let supabaseClient = null;
if (typeof window.supabase !== 'undefined' && SUPABASE_URL && SUPABASE_URL !== 'YOUR_SUPABASE_URL_HERE') {
    try {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log('[Supabase] Client initialized successfully.');
    } catch (e) {
        console.error('[Supabase] Initialization failed:', e);
    }
} else {
    console.warn('[Supabase] Credentials not configured or library missing. Falling back to local IndexedDB.');
}

// --- GLOBAL ERROR CATCHER (DEBUGGING TOOL) ---
window.addEventListener('error', function(e) {
    console.error("Global uncaught error: ", e.error || e.message);
    const msg = `Uncaught Error: ${e.message} at ${e.filename ? e.filename.split('/').pop() : 'unknown'}:${e.lineno || 0}`;
    fetch(`/log-test?status=error&msg=${encodeURIComponent(msg)}`).catch(() => {});
    if (typeof showToast === 'function') {
        showToast(`System Error: ${e.message} at ${e.filename.split('/').pop()}:${e.lineno}`, 'danger');
    } else {
        alert(`System Error: ${e.message}\nFile: ${e.filename}\nLine: ${e.lineno}`);
    }
});

window.addEventListener('unhandledrejection', function(e) {
    console.error("Unhandled promise rejection: ", e.reason);
    const reasonStr = e.reason ? (e.reason.message || e.reason) : 'unknown';
    const msg = `Unhandled Rejection: ${reasonStr}`;
    fetch(`/log-test?status=error&msg=${encodeURIComponent(msg)}`).catch(() => {});
    if (typeof showToast === 'function') {
        showToast(`System Error: ${msg}`, 'danger');
    }
});

// --- CONSOLE LOGGER REDIRECTOR FOR TEST MODE ---
if (new URLSearchParams(window.location.search).get('test') === 'true') {
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;
    
    console.log = function(...args) {
        originalLog.apply(console, args);
        const msg = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' ');
        fetch(`/log-test?status=info&msg=${encodeURIComponent(msg)}`).catch(() => {});
    };
    
    console.error = function(...args) {
        originalError.apply(console, args);
        const msg = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' ');
        fetch(`/log-test?status=error&msg=${encodeURIComponent(msg)}`).catch(() => {});
    };

    console.warn = function(...args) {
        originalWarn.apply(console, args);
        const msg = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' ');
        fetch(`/log-test?status=warn&msg=${encodeURIComponent(msg)}`).catch(() => {});
    };
}

// --- TOAST NOTIFICATIONS ---
function showToast(message, type = 'info') {
    try {
        console.log(`Toast Notification: [${type}] ${message}`);
        let container = document.getElementById('toastContainer');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toastContainer';
            container.className = 'toast-container';
            document.body.appendChild(container);
        }

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        
        let iconHtml = '<span>ℹ️</span>'; // default info
        if (type === 'success') {
            iconHtml = '<span style="color:var(--success); font-weight:bold;">✔</span>';
        } else if (type === 'danger') {
            iconHtml = '<span style="color:var(--danger); font-weight:bold;">✖</span>';
        } else if (type === 'warning') {
            iconHtml = '<span style="color:var(--warning); font-weight:bold;">⚠</span>';
        }

        toast.innerHTML = `
            ${iconHtml}
            <div style="flex-grow: 1;">${message}</div>
        `;

        container.appendChild(toast);

        // Auto remove
        setTimeout(() => {
            toast.style.transition = 'opacity 0.35s ease, transform 0.35s ease';
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(20px)';
            setTimeout(() => {
                if (toast.parentNode === container) {
                    container.removeChild(toast);
                }
            }, 350);
        }, 4000);
    } catch (err) {
        console.error('Error showing toast:', err);
    }
}

// --- CONSTANTS & STATE CONTROLLER ---
const STORAGE_KEYS = {
    CUSTOMERS: 'wallmart_customers',
    PRESCRIPTIONS: 'wallmart_prescriptions',
    PURCHASES: 'wallmart_purchases',
    REMINDERS: 'wallmart_reminders',
    USERS: 'wallmart_users',
    SETTINGS: 'wallmart_settings',
    CURRENT_USER: 'wallmart_current_user',
    THEME: 'wallmart_active_theme',
    LOGS: 'wallmart_logs'
};

// State representation
let state = {
    customers: [],
    prescriptions: [],
    purchases: [],
    reminders: [],
    users: [],
    logs: [],
    settings: {
        storeName: 'MediNest Pharmacy',
        tagline: 'Care Beyond Medicines',
        rupeesPerPoint: 100
    },
    currentUser: null, // Logged in user object: { name, username, role, password }
    currentCustomerId: null // Tracks active patient profile page
};

// Temp array to store images uploaded in the current prescription modal interaction
let currentPrescriptionImages = [];
let activeViewingRx = null; // Tracks prescription currently opened in modal view

// --- DEFENSIVE SAFE WRAPPERS FOR PROTOCOL & DOM SECURITY ---
const memoryStorageFallback = {};

const safeStorage = {
    getItem(key) {
        try {
            return localStorage.getItem(key);
        } catch (e) {
            console.warn(`localStorage.getItem blocked for key "${key}" under this context (e.g. file:// URL restriction). Falling back to memory storage:`, e);
            return memoryStorageFallback[key] || null;
        }
    },
    setItem(key, value) {
        try {
            localStorage.setItem(key, value);
        } catch (e) {
            console.warn(`localStorage.setItem blocked for key "${key}" under this context (e.g. file:// URL restriction). Saved to memory fallback:`, e);
            memoryStorageFallback[key] = value;
        }
    },
    clear() {
        try {
            localStorage.clear();
        } catch (e) {
            console.warn("localStorage.clear blocked under this context. Wiping memory fallback:", e);
            for (const prop in memoryStorageFallback) {
                delete memoryStorageFallback[prop];
            }
        }
    }
};

function safeBind(target, event, handler) {
    if (!target) return;
    try {
        if (typeof target === 'string') {
            const el = document.getElementById(target);
            if (el) {
                el.addEventListener(event, handler);
            } else {
                console.warn(`Defensive binding: Element #${target} not found in DOM.`);
            }
        } else if (target instanceof NodeList || Array.isArray(target)) {
            target.forEach(el => safeBind(el, event, handler));
        } else if (target.addEventListener) {
            target.addEventListener(event, handler);
        }
    } catch (err) {
        console.error(`Error binding listener for event "${event}" on target:`, target, err);
    }
}

// --- DEFAULT RICH MOCK DATA ---
const MOCK_CUSTOMERS = [];

const defaultRxSvg = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400" viewBox="0 0 100 100"><rect width="100" height="100" fill="%23f1f5f9"/><text x="10" y="30" font-family="sans-serif" font-size="10" font-weight="bold" fill="%230f172a">Rx</text><line x1="10" y1="35" x2="90" y2="35" stroke="%23cbd5e1" stroke-width="0.5"/><text x="10" y="48" font-family="sans-serif" font-size="5" fill="%23334155">Tab. Telmisartan 40mg - 1 OD</text><text x="10" y="58" font-family="sans-serif" font-size="5" fill="%23334155">Tab. Atorvastatin 10mg - 1 HS</text><text x="10" y="68" font-family="sans-serif" font-size="5" fill="%23334155">Tab. Clopidogrel 75mg - 1 OD</text><text x="10" y="90" font-family="sans-serif" font-size="4" fill="%2364748b">Refills: 3 Months</text></svg>';

const MOCK_PRESCRIPTIONS = [];

const MOCK_PURCHASES = [];

const MOCK_REMINDERS = [];


// --- INDEXEDDB DATABASE MANAGER ---
let DB_NAME = 'WallmartPharmacyDB';
let DB_VERSION = 3;
const STORES = {
    CUSTOMERS: 'customers',
    PRESCRIPTIONS: 'prescriptions',
    PURCHASES: 'purchases',
    REMINDERS: 'refills',
    REFILLS: 'refills',
    USERS: 'users',
    SETTINGS: 'settings',
    LOYALTY: 'loyalty',
    LOGS: 'activity_logs'
};

let db = null;

// --- EMERGENCY DATA RECOVERY SYSTEM ---
function runEmergencyRecovery() {
    return new Promise((resolve) => {
        try {
            if (typeof indexedDB === 'undefined' || !indexedDB) {
                console.warn('IndexedDB not supported, skipping recovery.');
                resolve();
                return;
            }

            const scanDatabases = async () => {
                let dbList = [];
                if (typeof indexedDB.databases === 'function') {
                    try {
                        const dbs = await indexedDB.databases();
                        dbList = dbs.map(d => d.name);
                    } catch (e) {
                        console.error('Error calling indexedDB.databases():', e);
                    }
                }

                // Known candidates to scan if list is empty or doesn't contain them
                const candidates = ['RxHelperDB', 'RxHelper', 'rx-helper', 'rx_helper', 'WallmartPharmacyDB'];
                let namesToScan = [...new Set([...dbList, ...candidates])];

                const scanPromises = namesToScan.map(name => {
                    return new Promise((res) => {
                        let isNew = false;
                        const req = indexedDB.open(name);

                        req.onupgradeneeded = (e) => {
                            isNew = true; // Database did not exist
                            const tempDb = e.target.result;
                            tempDb.close();
                        };

                        req.onsuccess = (e) => {
                            const tempDb = e.target.result;
                            if (isNew) {
                                // If it was newly created, close it and delete it immediately to satisfy constraint
                                tempDb.close();
                                indexedDB.deleteDatabase(name);
                                res(null);
                                return;
                            }

                            const storeNames = Array.from(tempDb.objectStoreNames);
                            const info = { name: name, version: tempDb.version, stores: {}, totalRecords: 0 };

                            if (storeNames.length === 0) {
                                tempDb.close();
                                res(info);
                                return;
                            }

                            let completed = 0;
                            storeNames.forEach(storeName => {
                                try {
                                    const tx = tempDb.transaction(storeName, 'readonly');
                                    const store = tx.objectStore(storeName);
                                    const countReq = store.count();
                                    countReq.onsuccess = () => {
                                        info.stores[storeName] = countReq.result;
                                        info.totalRecords += countReq.result;
                                        completed++;
                                        if (completed === storeNames.length) {
                                            tempDb.close();
                                            res(info);
                                        }
                                    };
                                    countReq.onerror = () => {
                                        info.stores[storeName] = 0;
                                        completed++;
                                        if (completed === storeNames.length) {
                                            tempDb.close();
                                            res(info);
                                        }
                                    };
                                } catch (err) {
                                    info.stores[storeName] = 0;
                                    completed++;
                                    if (completed === storeNames.length) {
                                        tempDb.close();
                                        res(info);
                                    }
                                }
                            });
                        };

                        req.onerror = () => {
                            res(null);
                        };
                    });
                });

                const results = await Promise.all(scanPromises);
                // Filter out nulls and databases that have no stores/records
                const validResults = results.filter(r => r !== null && Object.keys(r.stores).length > 0);

                let bestDb = null;
                let maxCustomerRecords = -1;

                validResults.forEach(r => {
                    const custCount = r.stores['customers'] || r.stores['customer'] || r.stores['patients'] || r.stores['patient'] || 0;
                    if (custCount > 0 && custCount > maxCustomerRecords) {
                        maxCustomerRecords = custCount;
                        bestDb = r;
                    }
                });

                if (bestDb) {
                    DB_NAME = bestDb.name;
                    DB_VERSION = bestDb.version;
                    console.log(`[Recovery] UI Reconnected to: ${DB_NAME} (v${DB_VERSION}) containing ${maxCustomerRecords} customer records.`);
                } else {
                    // Fallback: if WallmartPharmacyDB exists and has some data, keep it, otherwise look for database with any records
                    const defaultDb = validResults.find(r => r.name === 'WallmartPharmacyDB');
                    if (defaultDb) {
                        DB_NAME = defaultDb.name;
                        DB_VERSION = defaultDb.version;
                    } else if (validResults.length > 0) {
                        // Pick the one with the most total records
                        let maxRecords = -1;
                        let pick = null;
                        validResults.forEach(r => {
                            if (r.totalRecords > maxRecords) {
                                maxRecords = r.totalRecords;
                                pick = r;
                            }
                        });
                        if (pick) {
                            DB_NAME = pick.name;
                            DB_VERSION = pick.version;
                        }
                    }
                }

                renderRecoveryReport(validResults, bestDb || validResults.find(r => r.name === DB_NAME));
                resolve();
            };

            scanDatabases();
        } catch (err) {
            console.error('Error running emergency recovery:', err);
            resolve();
        }
    });
}

function renderRecoveryReport(results, bestDb) {
    const tableBody = document.getElementById('recoveryReportTableBody');
    const summaryDiv = document.getElementById('recoveryReportSummary');
    const loginRecoveryStatus = document.getElementById('loginRecoveryStatus');
    const loginRecoveryText = document.getElementById('loginRecoveryText');

    if (!tableBody || !summaryDiv) return;

    tableBody.innerHTML = '';

    if (results.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="5" style="text-align: center;">No databases found on this origin.</td></tr>`;
        summaryDiv.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 4px;">
                <div style="font-weight: 700; color: var(--danger);">Status: No databases found</div>
                <div>No active or legacy IndexedDB databases were detected on the origin file__0. Using default WallmartPharmacyDB.</div>
            </div>
        `;
        return;
    }

    let html = '';
    results.forEach(r => {
        const isRecovered = bestDb && r.name === bestDb.name;
        const storesList = Object.keys(r.stores);

        storesList.forEach((store, idx) => {
            const count = r.stores[store];
            const rowStyle = isRecovered ? 'background-color: rgba(16, 185, 129, 0.05); font-weight: 600;' : '';

            html += `
                <tr style="${rowStyle}">
                    ${idx === 0 ? `<td rowspan="${storesList.length}" style="vertical-align: middle; font-weight: 700;">${r.name}</td>` : ''}
                    ${idx === 0 ? `<td rowspan="${storesList.length}" style="vertical-align: middle; text-align: center;">${r.version}</td>` : ''}
                    <td><code>${store}</code></td>
                    <td style="text-align: right;">${count}</td>
                    ${idx === 0 ? `<td rowspan="${storesList.length}" style="vertical-align: middle; text-align: center;">
                        ${isRecovered ? '<span style="color: var(--primary); font-weight: bold;">RECONNECTED</span>' : '<span style="color: var(--text-muted);">INACTIVE</span>'}
                    </td>` : ''}
                </tr>
            `;
        });
    });

    tableBody.innerHTML = html;

    if (bestDb) {
        const custCount = bestDb.stores['customers'] || bestDb.stores['customer'] || bestDb.stores['patients'] || bestDb.stores['patient'] || 0;
        summaryDiv.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 4px;">
                <div style="font-weight: 700; color: var(--primary); display: flex; align-items: center; gap: 6px;">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="width: 16px; height: 16px; stroke-width: 3; color: var(--primary);">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    Status: Reconnected to database "${bestDb.name}"
                </div>
                <div>Successfully recovered <strong>${custCount} customer/patient records</strong> and associated prescription, purchase, and refill timelines.</div>
                <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">Connected DB Name: <code>${bestDb.name}</code> (version: ${bestDb.version})</div>
            </div>
        `;

        // UI recovery messages suppressed from login page as per requirement
        /*
        if (loginRecoveryStatus && loginRecoveryText) {
            loginRecoveryStatus.style.display = 'block';
            loginRecoveryText.innerHTML = `Successfully recovered <strong>${custCount} patient records</strong> from database <code>${bestDb.name}</code>. Reconnected UI successfully.`;
        }
        */
    } else {
        summaryDiv.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 4px;">
                <div style="font-weight: 700; color: var(--text-muted);">Status: No customer data found in existing databases</div>
                <div>Scanned databases: ${results.map(r => `"${r.name}"`).join(', ')}. Operating in default database <code>${DB_NAME}</code>.</div>
            </div>
        `;

        // UI recovery messages suppressed from login page as per requirement
        /*
        if (loginRecoveryStatus && loginRecoveryText) {
            loginRecoveryStatus.style.display = 'block';
            loginRecoveryStatus.style.borderColor = 'var(--text-muted)';
            loginRecoveryStatus.style.backgroundColor = 'var(--slate-50)';
            loginRecoveryText.innerHTML = `No legacy customer records found. Operating in default database <code>${DB_NAME}</code>.`;
        }
        */
    }
}

function dbOpen() {
    return new Promise((resolve, reject) => {
        if (supabaseClient) {
            db = { isSupabase: true };
        }
        try {
            if (typeof indexedDB === 'undefined' || !indexedDB) {
                if (supabaseClient) {
                    return resolve(db);
                }
                return reject(new Error('IndexedDB is not supported or is blocked.'));
            }

            const openWithVersion = (version) => {
                console.log(`Opening database: ${DB_NAME} (Version: ${version || 'Default'})`);
                const request = version ? indexedDB.open(DB_NAME, version) : indexedDB.open(DB_NAME);

                request.onupgradeneeded = (e) => {
                    const database = e.target.result;
                    console.log(`onupgradeneeded triggered. Database version is: ${database.version}`);
                    
                    const requiredStores = [...new Set(Object.values(STORES))];
                    requiredStores.forEach(storeName => {
                        if (!database.objectStoreNames.contains(storeName)) {
                            database.createObjectStore(storeName, { keyPath: 'id' });
                            console.log(`Database upgrade: Created object store "${storeName}"`);
                        }
                    });
                };

                request.onsuccess = async (e) => {
                    const database = e.target.result;
                    
                    // Schema Validation
                    const requiredStores = [...new Set(Object.values(STORES))];
                    const missingStores = requiredStores.filter(storeName => !database.objectStoreNames.contains(storeName));

                    if (missingStores.length > 0) {
                        console.warn(`Database Schema Validation failed. Missing stores: ${missingStores.join(', ')}`);
                        const currentVersion = database.version;
                        database.close(); // Close to allow upgrade

                        const nextVersion = currentVersion + 1;
                        console.log(`Re-opening database at version ${nextVersion} to dynamically build missing stores...`);
                        
                        const upgradeRequest = indexedDB.open(DB_NAME, nextVersion);
                        
                        upgradeRequest.onupgradeneeded = (ue) => {
                            const udb = ue.target.result;
                            requiredStores.forEach(storeName => {
                                if (!udb.objectStoreNames.contains(storeName)) {
                                    udb.createObjectStore(storeName, { keyPath: 'id' });
                                    console.log(`Dynamic Upgrade: Created missing store "${storeName}"`);
                                }
                            });
                        };
                        
                        upgradeRequest.onsuccess = async (ue) => {
                            db = ue.target.result;
                            console.log("Database schema successfully upgraded and verified.");
                            await checkAndMigrateReminders(db);
                            resolve(db);
                        };
                        
                        upgradeRequest.onerror = (ue) => {
                            console.error("Database dynamic upgrade failed:", ue.target.error);
                            if (supabaseClient) {
                                resolve(db);
                            } else {
                                reject(ue.target.error);
                            }
                        };
                    } else {
                        db = database;
                        console.log("Database schema validation passed successfully. All required stores present.");
                        await checkAndMigrateReminders(db);
                        resolve(db);
                    }
                };

                request.onerror = (e) => {
                    console.error('IndexedDB open error:', e.target.error);
                    if (supabaseClient) {
                        resolve(db);
                    } else {
                        reject(e.target.error);
                    }
                };
            };

            // First run, open with DB_VERSION (default 2)
            openWithVersion(DB_VERSION);
        } catch (err) {
            console.warn('IndexedDB initialization blocked or threw error. Falling back to local storage:', err);
            if (supabaseClient) {
                resolve(db);
            } else {
                reject(err);
            }
        }
    });
}

// Helper to migrate reminders to refills if legacy table exists
async function checkAndMigrateReminders(database) {
    if (database.objectStoreNames.contains('reminders') && database.objectStoreNames.contains('refills')) {
        try {
            console.log("Checking for legacy reminders data migration...");
            // Get all items in refills first
            const refillsTransaction = database.transaction('refills', 'readonly');
            const refillsStore = refillsTransaction.objectStore('refills');
            const refillsCountReq = refillsStore.count();
            
            const refillCount = await new Promise((res, rej) => {
                refillsCountReq.onsuccess = () => res(refillsCountReq.result);
                refillsCountReq.onerror = () => rej(refillsCountReq.error);
            });

            if (refillCount === 0) {
                console.log("Refills store is empty. Migrating legacy reminders records...");
                const remindersTransaction = database.transaction('reminders', 'readonly');
                const remindersStore = remindersTransaction.objectStore('reminders');
                const remindersGetAllReq = remindersStore.getAll();
                
                const legacyData = await new Promise((res, rej) => {
                    remindersGetAllReq.onsuccess = () => res(remindersGetAllReq.result || []);
                    remindersGetAllReq.onerror = () => rej(remindersGetAllReq.error);
                });

                if (legacyData.length > 0) {
                    const writeTx = database.transaction('refills', 'readwrite');
                    const writeStore = writeTx.objectStore('refills');
                    
                    for (const item of legacyData) {
                        writeStore.put(item);
                    }
                    
                    await new Promise((res, rej) => {
                        writeTx.oncomplete = () => res();
                        writeTx.onerror = () => rej(writeTx.error);
                    });
                    console.log(`Successfully migrated ${legacyData.length} records from 'reminders' to 'refills'.`);
                } else {
                    console.log("No legacy reminders data found.");
                }
            } else {
                console.log("Refills store already has records. Migration skipped.");
            }
        } catch (err) {
            console.error("Error migrating legacy reminders store:", err);
        }
    }
}

function getSupabaseTable(storeName) {
    if (storeName === STORES.CUSTOMERS) return 'customers';
    if (storeName === STORES.PRESCRIPTIONS) return 'prescriptions';
    if (storeName === STORES.PURCHASES) return 'purchases';
    if (storeName === STORES.REMINDERS || storeName === STORES.REFILLS) return 'refill_reminders';
    if (storeName === STORES.USERS) return 'users';
    if (storeName === STORES.SETTINGS) return 'settings';
    if (storeName === STORES.LOGS) return 'activity_logs';
    return null;
}

// --- LOCAL DATABASE HELPERS (FALLBACK) ---
function dbGetAllLocal(storeName) {
    return new Promise((resolve, reject) => {
        if (!db || db.isSupabase) return resolve([]);
        try {
            const transaction = db.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.getAll();
            request.onsuccess = (e) => resolve(e.target.result || []);
            request.onerror = (e) => reject(e.target.error);
        } catch (err) {
            reject(err);
        }
    });
}

function dbPutLocal(storeName, item) {
    return new Promise((resolve, reject) => {
        if (!db || db.isSupabase) return resolve(item);
        try {
            const transaction = db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.put(item);
            request.onsuccess = () => resolve(item);
            request.onerror = (e) => reject(e.target.error);
        } catch (err) {
            reject(err);
        }
    });
}

function dbDeleteLocal(storeName, id) {
    return new Promise((resolve, reject) => {
        if (!db || db.isSupabase) return resolve();
        try {
            const transaction = db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.delete(id);
            request.onsuccess = () => resolve();
            request.onerror = (e) => reject(e.target.error);
        } catch (err) {
            reject(err);
        }
    });
}

function dbClearAllLocal() {
    return new Promise((resolve, reject) => {
        if (!db || db.isSupabase) return resolve();
        try {
            const storeNames = [...new Set(Object.values(STORES))];
            const transaction = db.transaction(storeNames, 'readwrite');
            storeNames.forEach(storeName => {
                const store = transaction.objectStore(storeName);
                store.clear();
            });
            transaction.oncomplete = () => resolve();
            transaction.onerror = (e) => reject(e.target.error);
        } catch (err) {
            reject(err);
        }
    });
}

// --- DATABASE PUBLIC API ---
function dbGetAll(storeName) {
    if (supabaseClient) {
        const table = getSupabaseTable(storeName);
        if (table) {
            console.log(`[Supabase] dbGetAll from table: ${table}`);
            return supabaseClient.from(table).select('*').then(({ data, error }) => {
                if (error) {
                    console.error(`[Supabase Error] dbGetAll failed for table "${table}":`, error);
                    showToast(`Database Read Error [${table}]: ${error.message || error.details || error}`, 'danger');
                    return dbGetAllLocal(storeName);
                }
                const result = data || [];
                
                // Map results back to camelCase models with string IDs
                if (table === 'customers') {
                    return result.map(c => ({
                        id: c.id ? c.id.toString() : '',
                        name: c.name || '',
                        mobile: c.mobile || '',
                        age: c.age || 0,
                        gender: c.gender || '',
                        address: c.address || '',
                        familyId: c.familyId || c.family_id || c.familyid || '',
                        pointsCurrent: parseInt(c.pointsCurrent || c.loyalty_points || c.points || 0),
                        pointsRedeemed: parseInt(c.pointsRedeemed || c.points_redeemed || 0),
                        createdAt: c.createdAt || c.created_at || new Date().toISOString(),
                        redeemedHistory: c.redeemedHistory || c.redeemed_history || [],
                        whatsappReminders: c.whatsappReminders || c.whatsapp_reminders || []
                    }));
                }
                if (table === 'prescriptions') {
                    return result.map(p => ({
                        id: p.id ? p.id.toString() : '',
                        customerId: p.customerId || p.customer_id || '',
                        rxDate: p.rxDate || p.rx_date || '',
                        doctorName: p.doctorName || p.doctor_name || '',
                        rxImages: p.rxImages || p.rx_images || [],
                        pdfData: p.pdfData || p.pdf_data || '',
                        notes: p.notes || '',
                        createdAt: p.createdAt || p.created_at || new Date().toISOString()
                    }));
                }
                if (table === 'purchases') {
                    return result.map(p => ({
                        id: p.id ? p.id.toString() : '',
                        customerId: p.customerId || p.customer_id || '',
                        billNumber: p.billNumber || p.bill_number || '',
                        billDate: p.billDate || p.bill_date || '',
                        billAmount: parseFloat(p.billAmount || p.bill_amount || 0),
                        billPhoto: p.billPhoto || p.bill_photo || '',
                        medicines: p.medicines || '',
                        quantity: parseInt(p.quantity || 1),
                        pointsEarned: parseInt(p.pointsEarned || p.points_earned || 0),
                        createdAt: p.createdAt || p.created_at || new Date().toISOString()
                    }));
                }
                if (table === 'refill_reminders') {
                    return result.map(r => ({
                        id: r.id ? r.id.toString() : '',
                        customerId: r.customerId || r.customer_id || '',
                        medicineName: r.medicineName || r.medicine_name || '',
                        quantity: parseInt(r.quantity || 1),
                        daysSupply: parseInt(r.daysSupply || r.days_supply || 30),
                        expectedRefillDate: r.expectedRefillDate || r.expected_refill_date || '',
                        refillDate: r.refillDate || r.refill_date || '',
                        status: r.status || 'Upcoming',
                        createdAt: r.createdAt || r.created_at || new Date().toISOString()
                    }));
                }
                if (table === 'users') {
                    return result.map(u => ({
                        id: u.id ? u.id.toString() : '',
                        name: u.name || u.fullname || 'System User',
                        mobile: u.mobile || '',
                        username: u.username || '',
                        password: u.password || '',
                        role: u.role || 'Pharmacist',
                        createdAt: u.createdAt || u.created_at || new Date().toISOString(),
                        lastLoginAt: u.lastLoginAt || u.last_login_at || '',
                        loginCount: parseInt(u.loginCount || u.login_count || 0),
                        status: u.status || 'Active'
                    }));
                }
                if (table === 'settings') {
                    if (result.length > 0) {
                        const s = result[0];
                        return [{
                            id: 'app-settings',
                            storeName: s.storeName || 'MediNest Pharmacy',
                            tagline: s.tagline || 'Your Trusted Healthcare Partner',
                            rupeesPerPoint: parseInt(s.rupeesPerPoint || 100),
                            storeAddress: s.storeAddress || '',
                            storeMobile: s.storeMobile || '',
                            storeWhatsApp: s.storeWhatsApp || '',
                            logo: s.logo || '',
                            banner: s.banner || ''
                        }];
                    }
                    return [];
                }
                if (table === 'activity_logs') {
                    return result.map(l => ({
                        id: l.id ? l.id.toString() : '',
                        name: l.username || l.name || 'System',
                        role: l.role || 'System',
                        action: l.action || '',
                        timestamp: l.timestamp || l.created_at || new Date().toISOString()
                    }));
                }
                
                return result;
            }).catch(err => {
                console.error(`[Supabase Error] dbGetAll catch for table "${table}":`, err);
                showToast(`Database Connection Error [${table}]: ${err.message || err}`, 'danger');
                return dbGetAllLocal(storeName);
            });
        }
    }
    return dbGetAllLocal(storeName);
}

function dbPut(storeName, item) {
    if (supabaseClient) {
        const table = getSupabaseTable(storeName);
        if (table) {
            console.log(`[Supabase] dbPut into table ${table}:`, item);
            
            let payload = {};
            let isInsert = false;
            
            if (table === 'customers') {
                payload = {
                    name: item.name,
                    mobile: item.mobile,
                    age: parseInt(item.age || 0),
                    gender: item.gender,
                    address: item.address,
                    familyId: item.familyId || '',
                    pointsCurrent: parseInt(item.pointsCurrent || 0),
                    pointsRedeemed: parseInt(item.pointsRedeemed || 0),
                    createdAt: item.createdAt || new Date().toISOString(),
                    redeemedHistory: item.redeemedHistory || [],
                    whatsappReminders: item.whatsappReminders || [],
                    loyalty_points: parseInt(item.pointsCurrent || 0)
                };
                isInsert = !item.id || item.id.toString().startsWith('cust-') || isNaN(parseInt(item.id));
            } 
            else if (table === 'prescriptions') {
                payload = {
                    customerId: item.customerId,
                    rxDate: item.rxDate,
                    doctorName: item.doctorName,
                    rxImages: item.rxImages || [],
                    pdfData: item.pdfData || '',
                    notes: item.notes || '',
                    createdAt: item.createdAt || new Date().toISOString()
                };
                isInsert = !item.id || item.id.toString().startsWith('rx-') || isNaN(parseInt(item.id));
            }
            else if (table === 'purchases') {
                payload = {
                    customerId: item.customerId,
                    billNumber: item.billNumber,
                    billDate: item.billDate,
                    billAmount: parseFloat(item.billAmount || 0),
                    billPhoto: item.billPhoto || '',
                    medicines: item.medicines || '',
                    pointsEarned: parseInt(item.pointsEarned || 0),
                    createdAt: item.createdAt || new Date().toISOString()
                };
                isInsert = !item.id || item.id.toString().startsWith('pur-') || isNaN(parseInt(item.id));
            }
            else if (table === 'refill_reminders') {
                payload = {
                    customerId: item.customerId,
                    medicineName: item.medicineName,
                    quantity: parseInt(item.quantity || 1),
                    daysSupply: parseInt(item.daysSupply || 30),
                    expectedRefillDate: item.expectedRefillDate,
                    refillDate: item.refillDate,
                    status: item.status || 'Upcoming',
                    createdAt: item.createdAt || new Date().toISOString()
                };
                isInsert = !item.id || item.id.toString().startsWith('rem-') || isNaN(parseInt(item.id));
            }
            else if (table === 'users') {
                payload = {
                    name: item.name,
                    mobile: item.mobile,
                    username: item.username,
                    password: item.password,
                    role: item.role,
                    createdAt: item.createdAt || new Date().toISOString(),
                    lastLoginAt: item.lastLoginAt || '',
                    loginCount: parseInt(item.loginCount || 0)
                };
                isInsert = !item.id || item.id.toString().startsWith('user-') || isNaN(parseInt(item.id));
            }
            else if (table === 'settings') {
                payload = {
                    rupeesPerPoint: parseInt(item.rupeesPerPoint || 100),
                    storeAddress: item.storeAddress || '',
                    storeMobile: item.storeMobile || '',
                    storeWhatsApp: item.storeWhatsApp || '',
                    banner: item.banner || ''
                };
                payload.id = 1;
                isInsert = false;
            }
            else if (table === 'activity_logs') {
                payload = {
                    username: item.name || item.username || 'System',
                    role: item.role || 'System',
                    action: item.action,
                    timestamp: item.timestamp || new Date().toISOString()
                };
                isInsert = !item.id || item.id.toString().startsWith('log-') || isNaN(parseInt(item.id));
            }
            
            if (isInsert) {
                return supabaseClient.from(table).insert([payload]).select().then(({ data, error }) => {
                    if (error) {
                        console.error(`[Supabase Error] dbPut insert failed for table "${table}":`, error);
                        showToast(`Database Write Error [${table}]: ${error.message || error.details || error}`, 'danger');
                        return dbPutLocal(storeName, item);
                    }
                    if (data && data.length > 0) {
                        const saved = data[0];
                        item.id = saved.id.toString();
                        if (table === 'customers') {
                            item.pointsCurrent = saved.loyalty_points || 0;
                        }
                    }
                    dbPutLocal(storeName, item);
                    return item;
                }).catch(err => {
                    console.error(`[Supabase Error] dbPut insert catch for table "${table}":`, err);
                    showToast(`Database Connection Error [${table}]: ${err.message || err}`, 'danger');
                    return dbPutLocal(storeName, item);
                });
            } else {
                let query = supabaseClient.from(table);
                if (table === 'settings') {
                    return query.upsert(payload).then(({ error }) => {
                        if (error) {
                            console.error(`[Supabase Error] dbPut upsert failed for settings:`, error);
                            showToast(`Database Write Error [settings]: ${error.message || error.details || error}`, 'danger');
                            return dbPutLocal(storeName, item);
                        }
                        dbPutLocal(storeName, item);
                        return item;
                    }).catch(err => {
                        console.error(`[Supabase Error] dbPut upsert catch for settings:`, err);
                        showToast(`Database Connection Error [settings]: ${err.message || err}`, 'danger');
                        return dbPutLocal(storeName, item);
                    });
                } else {
                    const dbId = /^\d+$/.test(item.id.toString()) ? parseInt(item.id) : item.id;
                    return query.update(payload).eq('id', dbId).then(({ error }) => {
                        if (error) {
                            console.error(`[Supabase Error] dbPut update failed for table "${table}":`, error);
                            showToast(`Database Write Error [${table}]: ${error.message || error.details || error}`, 'danger');
                            return dbPutLocal(storeName, item);
                        }
                        dbPutLocal(storeName, item);
                        return item;
                    }).catch(err => {
                        console.error(`[Supabase Error] dbPut update catch for table "${table}":`, err);
                        showToast(`Database Connection Error [${table}]: ${err.message || err}`, 'danger');
                        return dbPutLocal(storeName, item);
                    });
                }
            }
        }
    }
    return dbPutLocal(storeName, item);
}


function dbDelete(storeName, id) {
    if (supabaseClient) {
        const table = getSupabaseTable(storeName);
        if (table) {
            console.log(`[Supabase] dbDelete ${id} from table ${table}`);
            return supabaseClient.from(table).delete().eq('id', id).then(({ error }) => {
                if (error) {
                    console.error(`[Supabase Error] dbDelete failed for table "${table}":`, error);
                    showToast(`Database Delete Error [${table}]: ${error.message || error.details || error}`, 'danger');
                    return dbDeleteLocal(storeName, id);
                }
            }).catch(err => {
                console.error(`[Supabase Error] dbDelete catch for table "${table}":`, err);
                showToast(`Database Connection Error [${table}]: ${err.message || err}`, 'danger');
                return dbDeleteLocal(storeName, id);
            });
        }
    }
    return dbDeleteLocal(storeName, id);
}

function dbClearAll() {
    if (supabaseClient) {
        console.log('[Supabase] dbClearAll triggered');
        const tables = ['activity_logs', 'refill_reminders', 'purchases', 'prescriptions', 'customers', 'users', 'settings'];
        const clearPromises = tables.map(table => {
            return supabaseClient.from(table).delete().neq('id', 'nonexistent_placeholder_id').then(({ error }) => {
                if (error) {
                    console.warn(`[Supabase] dbClearAll failed for ${table}:`, error);
                    throw error;
                }
            });
        });
        return Promise.all(clearPromises).catch(err => {
            console.warn('[Supabase] dbClearAll failed.', err);
            return dbClearAllLocal();
        });
    }
    return dbClearAllLocal();
}

// --- MIGRATE LOCAL DATA TO SUPABASE ---
async function migrateLocalDataToSupabase() {
    if (!supabaseClient) return;
    const isMigrated = localStorage.getItem('medinest_supabase_migrated');
    if (isMigrated === 'true') {
        console.log('[Supabase] Local data already migrated. Skipping migration.');
        return;
    }

    console.log('[Supabase] Starting data migration from IndexedDB/localStorage...');
    if (state.currentUser) {
        showToast('Migrating local data to remote database...', 'info');
    }

    try {
        // Ensure local DB is open
        if (!db) {
            await dbOpen();
        }

        // Helper to safely get all records locally
        const localGet = (storeName) => {
            return new Promise((resolve) => {
                if (!db) return resolve([]);
                try {
                    const tx = db.transaction(storeName, 'readonly');
                    const req = tx.objectStore(storeName).getAll();
                    req.onsuccess = () => resolve(req.result || []);
                    req.onerror = () => resolve([]);
                } catch (e) {
                    resolve([]);
                }
            });
        };

        // 1. Migrate Settings
        const settingsList = await localGet(STORES.SETTINGS);
        for (const s of settingsList) {
            const payload = {
                storeName: s.storeName || 'MediNest Pharmacy',
                tagline: s.tagline || 'Care Beyond Medicines',
                rupeesPerPoint: parseInt(s.rupeesPerPoint || 100),
                storeAddress: s.storeAddress || '',
                storeMobile: s.storeMobile || '',
                storeWhatsApp: s.storeWhatsApp || '',
                logo: s.logo || '',
                banner: s.banner || ''
            };
            const { error } = await supabaseClient.from('settings').upsert({ id: 1, ...payload });
            if (error) console.error('[Supabase Migration] Settings upsert failed:', error);
        }

        // 2. Migrate Users
        const usersList = await localGet(STORES.USERS);
        for (const u of usersList) {
            const isTempUserId = !u.id || u.id.toString().startsWith('user-') || isNaN(parseInt(u.id));
            const payload = {
                name: u.name,
                mobile: u.mobile,
                username: u.username,
                password: u.password,
                role: u.role,
                createdAt: u.createdAt || new Date().toISOString(),
                lastLoginAt: u.lastLoginAt || '',
                loginCount: parseInt(u.loginCount || 0)
            };
            if (!isTempUserId) {
                // Already has a numeric DB id — upsert to update existing row
                payload.id = parseInt(u.id);
            }
            if (isTempUserId) {
                const { data, error } = await supabaseClient.from('users').insert([payload]).select();
                if (error) {
                    console.error('[Supabase Migration] User insert failed:', error);
                } else if (data && data.length > 0) {
                    const oldId = u.id;
                    u.id = data[0].id.toString();
                    await dbPutLocal(STORES.USERS, u);
                    console.log(`[Supabase Migration] Migrated user: ${oldId} -> ${u.id}`);
                }
            } else {
                const { error } = await supabaseClient.from('users').upsert(payload);
                if (error) console.error('[Supabase Migration] User upsert failed:', error);
            }
        }

        // Keep track of customer ID mapping (local temp string -> remote integer string)
        const customerIdMap = {};

        // 3. Migrate Customers
        const customersList = await localGet(STORES.CUSTOMERS);
        for (const c of customersList) {
            const isTempId = !c.id || c.id.toString().startsWith('cust-') || isNaN(parseInt(c.id));
            if (isTempId) {
                const payload = {
                    name: c.name,
                    mobile: c.mobile,
                    age: parseInt(c.age || 0),
                    gender: c.gender,
                    address: c.address,
                    familyId: c.familyId || '',
                    pointsCurrent: parseInt(c.pointsCurrent || 0),
                    pointsRedeemed: parseInt(c.pointsRedeemed || 0),
                    createdAt: c.createdAt || new Date().toISOString(),
                    redeemedHistory: c.redeemedHistory || [],
                    whatsappReminders: c.whatsappReminders || [],
                    loyalty_points: parseInt(c.pointsCurrent || 0)
                };
                const { data, error } = await supabaseClient.from('customers').insert([payload]).select();
                if (error) {
                    console.error('[Supabase Migration] Customer insert failed:', error);
                } else if (data && data.length > 0) {
                    const newId = data[0].id.toString();
                    customerIdMap[c.id] = newId;
                    const oldId = c.id;
                    c.id = newId;
                    await dbPutLocal(STORES.CUSTOMERS, c);
                    console.log(`[Supabase Migration] Migrated customer: ${oldId} -> ${newId}`);
                }
            } else {
                customerIdMap[c.id] = c.id.toString();
            }
        }

        // 4. Migrate Prescriptions
        const rxList = await localGet(STORES.PRESCRIPTIONS);
        for (const rx of rxList) {
            const isTempId = !rx.id || rx.id.toString().startsWith('rx-') || isNaN(parseInt(rx.id));
            if (isTempId) {
                const mappedCustId = customerIdMap[rx.customerId] || rx.customerId;
                const payload = {
                    customerId: mappedCustId,
                    rxDate: rx.rxDate,
                    doctorName: rx.doctorName,
                    rxImages: rx.rxImages || [],
                    pdfData: rx.pdfData || '',
                    notes: rx.notes || '',
                    createdAt: rx.createdAt || new Date().toISOString()
                };
                const { data, error } = await supabaseClient.from('prescriptions').insert([payload]).select();
                if (error) {
                    console.error('[Supabase Migration] Prescription insert failed:', error);
                } else if (data && data.length > 0) {
                    const oldId = rx.id;
                    rx.id = data[0].id.toString();
                    rx.customerId = mappedCustId;
                    await dbPutLocal(STORES.PRESCRIPTIONS, rx);
                    console.log(`[Supabase Migration] Migrated prescription: ${oldId} -> ${rx.id}`);
                }
            }
        }

        // 5. Migrate Purchases
        const purchasesList = await localGet(STORES.PURCHASES);
        for (const p of purchasesList) {
            const isTempId = !p.id || p.id.toString().startsWith('pur-') || isNaN(parseInt(p.id));
            if (isTempId) {
                const mappedCustId = customerIdMap[p.customerId] || p.customerId;
                const payload = {
                    customerId: mappedCustId,
                    billNumber: p.billNumber,
                    billDate: p.billDate,
                    billAmount: parseFloat(p.billAmount || 0),
                    billPhoto: p.billPhoto || '',
                    medicines: p.medicines || '',
                    quantity: parseInt(p.quantity || 1),
                    pointsEarned: parseInt(p.pointsEarned || 0),
                    createdAt: p.createdAt || new Date().toISOString()
                };
                const { data, error } = await supabaseClient.from('purchases').insert([payload]).select();
                if (error) {
                    console.error('[Supabase Migration] Purchase insert failed:', error);
                } else if (data && data.length > 0) {
                    const oldId = p.id;
                    p.id = data[0].id.toString();
                    p.customerId = mappedCustId;
                    await dbPutLocal(STORES.PURCHASES, p);
                    console.log(`[Supabase Migration] Migrated purchase: ${oldId} -> ${p.id}`);
                }
            }
        }

        // 6. Migrate Reminders
        const remindersList = await localGet(STORES.REMINDERS);
        for (const rem of remindersList) {
            const isTempId = !rem.id || rem.id.toString().startsWith('rem-') || isNaN(parseInt(rem.id));
            if (isTempId) {
                const mappedCustId = customerIdMap[rem.customerId] || rem.customerId;
                const payload = {
                    customerId: mappedCustId,
                    medicineName: rem.medicineName,
                    quantity: parseInt(rem.quantity || 1),
                    daysSupply: parseInt(rem.daysSupply || 30),
                    expectedRefillDate: rem.expectedRefillDate,
                    refillDate: rem.refillDate,
                    status: rem.status || 'Upcoming',
                    createdAt: rem.createdAt || new Date().toISOString()
                };
                const { data, error } = await supabaseClient.from('refill_reminders').insert([payload]).select();
                if (error) {
                    console.error('[Supabase Migration] Reminder insert failed:', error);
                } else if (data && data.length > 0) {
                    const oldId = rem.id;
                    rem.id = data[0].id.toString();
                    rem.customerId = mappedCustId;
                    await dbPutLocal(STORES.REMINDERS, rem);
                    console.log(`[Supabase Migration] Migrated reminder: ${oldId} -> ${rem.id}`);
                }
            }
        }

        // 7. Migrate Logs
        const logsList = await localGet(STORES.LOGS);
        for (const l of logsList) {
            const isTempId = !l.id || l.id.toString().startsWith('log-') || isNaN(parseInt(l.id));
            if (isTempId) {
                const payload = {
                    username: l.name || l.username || 'System',
                    role: l.role || 'System',
                    action: l.action,
                    timestamp: l.timestamp || new Date().toISOString()
                };
                const { data, error } = await supabaseClient.from('activity_logs').insert([payload]).select();
                if (error) {
                    console.error('[Supabase Migration] Log insert failed:', error);
                } else if (data && data.length > 0) {
                    const oldId = l.id;
                    l.id = data[0].id.toString();
                    await dbPutLocal(STORES.LOGS, l);
                    console.log(`[Supabase Migration] Migrated activity log: ${oldId} -> ${l.id}`);
                }
            }
        }


        localStorage.setItem('medinest_supabase_migrated', 'true');
        if (state.currentUser) {
            showToast('Local data migrated to Supabase successfully!', 'success');
        }
        console.log('[Supabase] Migration completed successfully.');
    } catch (err) {
        console.error('[Supabase] Migration failed:', err);
        if (state.currentUser) {
            showToast('Data migration to Supabase failed. Check console for details.', 'danger');
        }
    }
}

// --- INITIALIZE & SYNC CONTROLLER ---
function initApp() {
    loadTheme();
    setupRouting();
    setupEvents();

    runEmergencyRecovery()
        .then(() => dbOpen())
        .then(() => migrateLocalDataToSupabase())
        .then(() => loadStateFromDatabase())
        .catch(err => {
            console.error('Database load failure. Falling back to storage legacy:', err);
            loadStateFromStorageFallback();
        })
        .finally(() => {
            // Apply branding texts on bootup
            applyBrandingSettingsText();
            
            // Check active session triggers and enforce login overlay
            checkSessionAndLogin();
            
            if (state.currentUser) {
                checkRemindersDueNotification();
            }

            // Check if we need to run automated registration tests
            if (new URLSearchParams(window.location.search).get('test') === 'true') {
                runAutomatedRegistrationTest();
            }
        });
}

function checkRemindersDueNotification() {
    if (!state.reminders || state.reminders.length === 0) return;
    const todayStr = new Date().toISOString().split('T')[0];
    const dueReminders = state.reminders.filter(r => r.status === 'Upcoming' && r.refillDate <= todayStr);
    
    if (dueReminders.length > 0) {
        showToast(`Attention: There are ${dueReminders.length} refill reminders due or overdue today!`, 'warning');
    }
}

function checkSessionAndLogin() {
    const activeSession = safeStorage.getItem(STORAGE_KEYS.CURRENT_USER);
    if (activeSession) {
        try {
            state.currentUser = JSON.parse(activeSession);
        } catch (e) {
            state.currentUser = null;
        }
    } else {
        state.currentUser = null;
    }
    
    if (state.currentUser) {
        document.body.classList.remove('not-logged-in');
        document.getElementById('loginScreen').style.display = 'none';
        applyUserPermissions();
        // Redirect if currently viewing an Admin-only page and they are a Pharmacist
        const adminModules = ['settingsModule', 'reportsModule'];
        const activeModule = document.querySelector('.app-module.active');
        if (state.currentUser.role !== 'Admin' && activeModule && adminModules.includes(activeModule.id)) {
            navigateToModule('dashboardModule');
        } else {
            // Reload active module layout
            const activeModuleId = activeModule ? activeModule.id : 'dashboardModule';
            navigateToModule(activeModuleId);
        }
    } else {
        document.body.classList.add('not-logged-in');
        document.getElementById('loginScreen').style.display = 'flex';
    }
}

async function loadStateFromDatabase() {
    try {
        console.log('[Supabase] Fetching database tables in parallel...');
        const [customers, prescriptions, purchases, reminders, users, logs, settingsData] = await Promise.all([
            dbGetAll(STORES.CUSTOMERS),
            dbGetAll(STORES.PRESCRIPTIONS),
            dbGetAll(STORES.PURCHASES),
            dbGetAll(STORES.REMINDERS),
            dbGetAll(STORES.USERS),
            dbGetAll(STORES.LOGS),
            dbGetAll(STORES.SETTINGS)
        ]);

        state.customers = customers || [];
        state.prescriptions = prescriptions || [];
        state.purchases = purchases || [];
        state.reminders = reminders || [];
        state.users = users || [];
        state.logs = logs || [];

        // Setup default users if empty
        if (!state.users || state.users.length === 0) {
            const defaultUsers = [
                { id: 'user-admin', username: 'admin', password: 'admin123', role: 'Admin', name: 'System Admin', mobile: '9999999999', createdAt: new Date().toISOString(), lastLoginAt: '', loginCount: 0, status: 'Active' },
                { id: 'user-pharmacist', username: 'pharmacist', password: 'pharma123', role: 'Pharmacist', name: 'Default Pharmacist', mobile: '8888888888', createdAt: new Date().toISOString(), lastLoginAt: '', loginCount: 0, status: 'Active' }
            ];
            state.users = defaultUsers;
            if (db) {
                await Promise.all(defaultUsers.map(u => dbPut(STORES.USERS, u)));
            }
            safeStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(defaultUsers));
        }

        // Add defaults to existing user records to prevent rendering undefined properties
        let usersUpdated = false;
        state.users = state.users.map(u => {
            let updated = false;
            if (!u.createdAt) {
                u.createdAt = new Date().toISOString();
                updated = true;
            }
            if (u.status === undefined) {
                u.status = 'Active';
                updated = true;
            }
            if (u.loginCount === undefined) {
                u.loginCount = 0;
                updated = true;
            }
            if (u.lastLoginAt === undefined) {
                u.lastLoginAt = '';
                updated = true;
            }
            if (updated) {
                usersUpdated = true;
            }
            return u;
        });
        if (usersUpdated) {
            if (db) {
                await Promise.all(state.users.map(u => dbPut(STORES.USERS, u)));
            }
            safeStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(state.users));
        }

        // Setup default logs if empty
        if (!state.logs) {
            state.logs = [];
        }

        // Load settings
        const savedSettings = (settingsData || []).find(s => s.id === 'app-settings');
        if (savedSettings) {
            state.settings = {
                storeName: (savedSettings.storeName === 'Wallmart Pharmacy' || !savedSettings.storeName) ? 'MediNest Pharmacy' : savedSettings.storeName,
                tagline: (savedSettings.tagline === 'Complete Patient History & Refill Management System' || !savedSettings.tagline) ? 'Care Beyond Medicines' : savedSettings.tagline,
                rupeesPerPoint: savedSettings.rupeesPerPoint,
                storeAddress: savedSettings.storeAddress || '',
                storeMobile: savedSettings.storeMobile || '',
                storeWhatsApp: savedSettings.storeWhatsApp || '',
                logo: savedSettings.logo || '',
                banner: savedSettings.banner || ''
            };
        } else {
            const localSettings = safeStorage.getItem(STORAGE_KEYS.SETTINGS);
            if (localSettings) {
                const parsed = JSON.parse(localSettings);
                state.settings = {
                    ...parsed,
                    storeName: (parsed.storeName === 'Wallmart Pharmacy' || !parsed.storeName) ? 'MediNest Pharmacy' : parsed.storeName,
                    tagline: (parsed.tagline === 'Complete Patient History & Refill Management System' || !parsed.tagline) ? 'Care Beyond Medicines' : parsed.tagline
                };
            }
        }
    } catch (e) {
        console.error('Error loading database tables:', e);
        loadStateFromStorageFallback();
    }

    // Session is checked asynchronously in initApp finally()

    // Populate mock customers if database is completely empty (removed to ensure only Supabase data is fetched)
    /*
    if (!state.customers || state.customers.length === 0) {
        state.customers = MOCK_CUSTOMERS;
        state.prescriptions = MOCK_PRESCRIPTIONS;
        state.purchases = MOCK_PURCHASES;
        state.reminders = MOCK_REMINDERS;
        await saveAllStateToDatabase();
    }
    */
}

function loadStateFromStorageFallback() {
    try {
        state.customers = JSON.parse(safeStorage.getItem(STORAGE_KEYS.CUSTOMERS)) || [];
        state.prescriptions = JSON.parse(safeStorage.getItem(STORAGE_KEYS.PRESCRIPTIONS)) || [];
        state.purchases = JSON.parse(safeStorage.getItem(STORAGE_KEYS.PURCHASES)) || [];
        state.reminders = JSON.parse(safeStorage.getItem(STORAGE_KEYS.REMINDERS)) || [];

        
        state.users = JSON.parse(safeStorage.getItem(STORAGE_KEYS.USERS)) || [
            { id: 'user-admin', username: 'admin', password: 'admin123', role: 'Admin', name: 'System Admin', mobile: '9999999999' },
            { id: 'user-pharmacist', username: 'pharmacist', password: 'pharma123', role: 'Pharmacist', name: 'Default Pharmacist', mobile: '8888888888' }
        ];
        state.users = state.users.map(u => {
            if (!u.createdAt) u.createdAt = new Date().toISOString();
            if (u.status === undefined) u.status = 'Active';
            if (u.loginCount === undefined) u.loginCount = 0;
            if (u.lastLoginAt === undefined) u.lastLoginAt = '';
            return u;
        });

        state.logs = JSON.parse(safeStorage.getItem(STORAGE_KEYS.LOGS)) || [];

        const localSettings = safeStorage.getItem(STORAGE_KEYS.SETTINGS);
        if (localSettings) {
            const parsed = JSON.parse(localSettings);
            state.settings = {
                ...parsed,
                storeName: (parsed.storeName === 'Wallmart Pharmacy' || !parsed.storeName) ? 'MediNest Pharmacy' : parsed.storeName,
                tagline: (parsed.tagline === 'Complete Patient History & Refill Management System' || !parsed.tagline) ? 'Care Beyond Medicines' : parsed.tagline
            };
        }
    } catch (e) {
        state.customers = MOCK_CUSTOMERS;
        state.prescriptions = MOCK_PRESCRIPTIONS;
        state.purchases = MOCK_PURCHASES;
        state.reminders = MOCK_REMINDERS;
    }
}

async function saveAllStateToDatabase() {
    saveStateToStorage();
    if (db || supabaseClient) {
        try {
            const custPromises = state.customers.map(c => dbPut(STORES.CUSTOMERS, c));
            const rxPromises = state.prescriptions.map(r => dbPut(STORES.PRESCRIPTIONS, r));
            const purPromises = state.purchases.map(p => dbPut(STORES.PURCHASES, p));
            const remPromises = state.reminders.map(rem => dbPut(STORES.REMINDERS, rem));
            const usersPromises = state.users.map(u => dbPut(STORES.USERS, u));
            const settingsPromise = dbPut(STORES.SETTINGS, { id: 'app-settings', ...state.settings });
            const logsPromises = (state.logs || []).map(l => dbPut(STORES.LOGS, l));

            await Promise.all([...custPromises, ...rxPromises, ...purPromises, ...remPromises, ...usersPromises, settingsPromise, ...logsPromises]);
        } catch (e) {
            console.error('Database write error:', e);
        }
    }
}

function saveStateToStorage() {
    try {
        safeStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(state.customers));
        safeStorage.setItem(STORAGE_KEYS.PRESCRIPTIONS, JSON.stringify(state.prescriptions));
        safeStorage.setItem(STORAGE_KEYS.PURCHASES, JSON.stringify(state.purchases));
        safeStorage.setItem(STORAGE_KEYS.REMINDERS, JSON.stringify(state.reminders));
        safeStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(state.users));
        safeStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(state.settings));
        safeStorage.setItem(STORAGE_KEYS.LOGS, JSON.stringify(state.logs || []));
    } catch (e) {
        console.error('Local storage backup write failed:', e);
    }
}

// --- DOCK DATA WRITERS ---
async function saveCustomer(cust) {
    const oldId = cust.id;
    try {
        if (supabaseClient) {
            console.log(`[Supabase] Saving customer "${cust.name}" (${cust.id}) to remote database...`);
            const savedItem = await dbPut(STORES.CUSTOMERS, cust);
            
            // If the ID was generated by the database, sync the local state and IndexedDB
            if (oldId !== savedItem.id) {
                console.log(`[Supabase] Customer ID updated from ${oldId} to ${savedItem.id}`);
                state.customers = state.customers.filter(c => c.id !== oldId);
                state.customers.push(savedItem);
                
                safeStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(state.customers));
                if (db && !db.isSupabase) {
                    await dbDeleteLocal(STORES.CUSTOMERS, oldId);
                    await dbPutLocal(STORES.CUSTOMERS, savedItem);
                }
            } else {
                const index = state.customers.findIndex(c => c.id === cust.id);
                if (index >= 0) {
                    state.customers[index] = cust;
                } else {
                    state.customers.push(cust);
                }
                safeStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(state.customers));
                if (db && !db.isSupabase) {
                    await dbPutLocal(STORES.CUSTOMERS, cust);
                }
            }
        } else {
            console.log(`[Supabase] Client offline or disabled. Saving customer "${cust.name}" locally.`);
            const index = state.customers.findIndex(c => c.id === cust.id);
            if (index >= 0) {
                state.customers[index] = cust;
            } else {
                state.customers.push(cust);
            }
            safeStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(state.customers));
            if (db) {
                await dbPutLocal(STORES.CUSTOMERS, cust);
            }
            showToast(`Customer "${cust.name}" saved to local database (Supabase Offline).`, 'info');
        }
    } catch (e) {
        console.error('Save customer persistence failed:', e);
        showToast(`Error saving customer: ${e.message || e}`, 'danger');
    }
}


async function removeCustomer(custId) {
    if (state.currentUser.role !== 'Admin') {
        showToast('Permission denied. Admin accounts required to delete records.', 'danger');
        return;
    }

    state.customers = state.customers.filter(c => c.id !== custId);
    
    const rxToDelete = state.prescriptions.filter(r => r.customerId === custId);
    const purToDelete = state.purchases.filter(p => p.customerId === custId);
    const remToDelete = state.reminders.filter(rem => rem.customerId === custId);

    state.prescriptions = state.prescriptions.filter(r => r.customerId !== custId);
    state.purchases = state.purchases.filter(p => p.customerId !== custId);
    state.reminders = state.reminders.filter(rem => rem.customerId !== custId);

    saveStateToStorage();

    if (db) {
        try {
            await dbDelete(STORES.CUSTOMERS, custId);
            await Promise.all([
                ...rxToDelete.map(r => dbDelete(STORES.PRESCRIPTIONS, r.id)),
                ...purToDelete.map(p => dbDelete(STORES.PURCHASES, p.id)),
                ...remToDelete.map(rem => dbDelete(STORES.REMINDERS, rem.id))
            ]);
        } catch (e) {
            console.error('Delete customer from database failed:', e);
        }
    }
}

async function savePrescription(rx) {
    state.prescriptions.push(rx);
    try {
        safeStorage.setItem(STORAGE_KEYS.PRESCRIPTIONS, JSON.stringify(state.prescriptions));
        if (db) {
            await dbPut(STORES.PRESCRIPTIONS, rx);
        }
    } catch (e) {
        console.error('Save prescription database write failed:', e);
    }
}

async function savePurchase(pur) {
    state.purchases.push(pur);
    try {
        safeStorage.setItem(STORAGE_KEYS.PURCHASES, JSON.stringify(state.purchases));
        if (db) {
            await dbPut(STORES.PURCHASES, pur);
        }
    } catch (e) {
        console.error('Save purchase database write failed:', e);
    }
}

async function saveReminder(rem) {
    const index = state.reminders.findIndex(r => r.id === rem.id);
    if (index >= 0) {
        state.reminders[index] = rem;
    } else {
        state.reminders.push(rem);
    }

    try {
        safeStorage.setItem(STORAGE_KEYS.REMINDERS, JSON.stringify(state.reminders));
        if (db) {
            await dbPut(STORES.REMINDERS, rem);
        }
    } catch (e) {
        console.error('Save reminder database write failed:', e);
    }
}

function getCustomerRank(cust) {
    const patientPurchases = state.purchases.filter(p => p.customerId === cust.id);
    const totalSpent = patientPurchases.reduce((acc, p) => acc + p.billAmount, 0);
    const points = cust.pointsCurrent;

    if (totalSpent >= 15000 || points >= 150) {
        return { label: 'Platinum Member', class: 'rank-platinum' };
    } else if (totalSpent >= 8000 || points >= 80) {
        return { label: 'Gold Member', class: 'rank-gold' };
    } else if (totalSpent >= 3000 || points >= 30) {
        return { label: 'Silver Member', class: 'rank-silver' };
    } else {
        return { label: 'Bronze Member', class: 'rank-bronze' };
    }
}

// --- THEMING CONTROLLER ---
function loadTheme() {
    state.activeTheme = safeStorage.getItem(STORAGE_KEYS.THEME) || 'light';
    document.documentElement.setAttribute('data-theme', state.activeTheme);
}

function toggleTheme() {
    state.activeTheme = state.activeTheme === 'light' ? 'dark' : 'light';
    safeStorage.setItem(STORAGE_KEYS.THEME, state.activeTheme);
    document.documentElement.setAttribute('data-theme', state.activeTheme);
    showToast(`Switched to ${state.activeTheme} mode!`, 'info');
}

// --- ROLE AUTH & PERMISSIONS CONTROLLER ---
function applyUserPermissions() {
    const user = state.currentUser;
    if (!user) return;

    // Header Display
    const userDisplay = document.getElementById('loggedInUserDisplay');
    if (userDisplay) {
        userDisplay.textContent = `${user.role} (${user.username})`;
    }

    // Sidebar Displays
    const sidebarUser = document.getElementById('sidebarUserText');
    if (sidebarUser) {
        sidebarUser.textContent = `User: ${user.username}`;
    }
    const roleText = document.getElementById('activeRoleText');
    if (roleText) {
        roleText.textContent = user.role;
    }
    const roleDot = document.getElementById('roleIndicatorDot');
    if (roleDot) {
        roleDot.style.backgroundColor = (user.role === 'Admin') ? 'var(--primary)' : 'var(--info)';
    }

    // Show/Hide Admin-only links based on Admin role
    const adminModules = ['settingsModule', 'reportsModule', 'monitoringModule'];
    adminModules.forEach(moduleId => {
        const link = document.querySelector(`.nav-link[data-target="${moduleId}"]`);
        if (link) {
            const parent = link.closest('.nav-item');
            if (parent) {
                if (user.role === 'Admin') {
                    parent.style.display = 'block';
                } else {
                    parent.style.display = 'none';
                }
            }
        }
    });

    // Redirect Pharmacist if they are stuck on an Admin-only page
    if (user.role !== 'Admin') {
        const activeModule = document.querySelector('.app-module.active');
        if (activeModule && adminModules.includes(activeModule.id)) {
            navigateToModule('dashboardModule');
        }
    }

    // Apply custom branding details
    applyBrandingSettingsText();
}

function applyBrandingSettingsText() {
    const title = state.settings.storeName || 'MediNest Pharmacy';
    const tagline = state.settings.tagline || 'Care Beyond Medicines';

    // Update Browser tab
    document.title = `${title} | ${tagline}`;

    // Update Mobile header
    const mobileHeaderTitle = document.querySelector('.mobile-header .logo-text h1');
    if (mobileHeaderTitle) mobileHeaderTitle.textContent = title;

    // Update Sidebar Logo
    const sidebarLogoH1 = document.querySelector('.sidebar .logo-text h1');
    if (sidebarLogoH1) sidebarLogoH1.textContent = title.split(' ')[0] || title;
    const sidebarLogoP = document.querySelector('.sidebar .logo-text p');
    if (sidebarLogoP) sidebarLogoP.textContent = title.split(' ').slice(1).join(' ') || 'Pharmacy';

    // Settings page fields
    const setStoreNameInput = document.getElementById('setStoreName');
    if (setStoreNameInput) setStoreNameInput.value = title;
    const setTaglineInput = document.getElementById('setTagline');
    if (setTaglineInput) setTaglineInput.value = tagline;
    const setRupeesPerPointInput = document.getElementById('setRupeesPerPoint');
    if (setRupeesPerPointInput) setRupeesPerPointInput.value = state.settings.rupeesPerPoint || 100;
    
    const setStoreAddressInput = document.getElementById('setStoreAddress');
    if (setStoreAddressInput) setStoreAddressInput.value = state.settings.storeAddress || '';
    const setStoreMobileInput = document.getElementById('setStoreMobile');
    if (setStoreMobileInput) setStoreMobileInput.value = state.settings.storeMobile || '';
    const setStoreWhatsAppInput = document.getElementById('setStoreWhatsApp');
    if (setStoreWhatsAppInput) setStoreWhatsAppInput.value = state.settings.storeWhatsApp || '';

    const logoPreview = document.getElementById('logoPreview');
    if (logoPreview) {
        logoPreview.src = state.settings.logo || './medinest-logo.png';
        logoPreview.style.display = 'block';
    }
    const bannerPreview = document.getElementById('bannerPreview');
    if (bannerPreview) {
        if (state.settings.banner) {
            bannerPreview.src = state.settings.banner;
            bannerPreview.style.display = 'block';
        } else {
            bannerPreview.style.display = 'none';
        }
    }

    // Login screen fields
    const loginAppTitle = document.getElementById('loginAppTitle');
    if (loginAppTitle) loginAppTitle.textContent = title;
    const loginAppTagline = document.getElementById('loginAppTagline');
    if (loginAppTagline) loginAppTagline.textContent = tagline;

    // Apply custom logo to all logo-icon SVGs
    document.querySelectorAll('.logo-icon').forEach(icon => {
        if (icon.closest('.mobile-header') || icon.closest('.sidebar') || icon.closest('.login-wrapper') || icon.closest('.welcome-banner')) {
            // Keep normal branding
        }
        icon.innerHTML = `<img src="${state.settings.logo || './medinest-logo.png'}" style="width: 100%; height: 100%; object-fit: contain; border-radius: 50%;">`;
    });

    // Apply custom banner to welcome banner background
    const welcomeBanner = document.querySelector('.welcome-banner');
    if (welcomeBanner) {
        if (state.settings.banner) {
            welcomeBanner.style.backgroundImage = `linear-gradient(rgba(0,0,0,0.35), rgba(0,0,0,0.35)), url(${state.settings.banner})`;
            welcomeBanner.style.backgroundSize = 'cover';
            welcomeBanner.style.backgroundPosition = 'center';
        } else {
            welcomeBanner.style.backgroundImage = ''; // default CSS fallback
        }
    }
}

// --- SINGLE PAGE ROUTING ---
function setupRouting() {
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
        safeBind(link, 'click', function(e) {
            e.preventDefault();
            const targetModule = this.getAttribute('data-target');
            navigateToModule(targetModule);
            
            // Close mobile menu if open
            const sidebar = document.getElementById('sidebarMenu');
            if (sidebar) sidebar.classList.remove('mobile-open');
        });
    });

    safeBind('mobileMenuToggle', 'click', () => {
        const sidebar = document.getElementById('sidebarMenu');
        if (sidebar) sidebar.classList.toggle('mobile-open');
    });

    safeBind(document, 'click', (e) => {
        const sidebar = document.getElementById('sidebarMenu');
        const toggleBtn = document.getElementById('mobileMenuToggle');
        if (sidebar && toggleBtn && window.innerWidth <= 768 && 
            sidebar.classList.contains('mobile-open') && 
            !sidebar.contains(e.target) && 
            !toggleBtn.contains(e.target)) {
            sidebar.classList.remove('mobile-open');
        }
    });

    safeBind('cardCustomersNav', 'click', () => navigateToModule('customersModule'));
    safeBind('cardSalesNav', 'click', () => navigateToModule('purchasesModule'));
    safeBind('cardLoyaltyNav', 'click', () => navigateToModule('reportsModule'));
    safeBind('dashViewCustomersBtn', 'click', () => navigateToModule('customersModule'));
}

function navigateToModule(moduleId) {
    // Access controls routing block
    const adminModules = ['settingsModule', 'reportsModule', 'monitoringModule'];
    if (adminModules.includes(moduleId) && (!state.currentUser || state.currentUser.role !== 'Admin')) {
        showToast('Access restricted to System Admins only.', 'warning');
        moduleId = 'dashboardModule';
    }

    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    document.querySelectorAll('.app-module').forEach(m => m.classList.remove('active'));

    const activeLink = document.querySelector(`.nav-link[data-target="${moduleId}"]`);
    if (activeLink) activeLink.classList.add('active');

    const targetModule = document.getElementById(moduleId);
    if (targetModule) targetModule.classList.add('active');

    // Load dynamic page contents
    if (moduleId === 'dashboardModule') renderDashboard();
    if (moduleId === 'customersModule') renderCustomersList();
    if (moduleId === 'prescriptionsModule') renderPrescriptionsModule();
    if (moduleId === 'purchasesModule') renderPurchasesModule();
    if (moduleId === 'remindersModule') renderRemindersModule();
    if (moduleId === 'reportsModule') renderReportsModule();
    if (moduleId === 'monitoringModule') renderMonitoringDashboard();
    if (moduleId === 'settingsModule') {
        renderUsersSettingsList();
        applyBrandingSettingsText();
    }
}

// --- DYNAMIC RENDER: DASHBOARD ---
function renderDashboard() {
    const now = new Date();
    const hours = now.getHours();
    let greeting = 'Good Evening';
    if (hours < 12) greeting = 'Good Morning';
    else if (hours < 17) greeting = 'Good Afternoon';
    
    const user = state.currentUser;
    document.getElementById('dashboardGreeting').textContent = `${greeting}, ${user ? user.name : 'Staff'}`;
    
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    document.getElementById('currentDateString').textContent = now.toLocaleDateString('en-US', options);

    // Stats
    const countEl = document.getElementById('statTotalCustomers');
    if (countEl) {
        if (supabaseClient) {
            countEl.innerHTML = `${state.customers.length} <span style="font-size: 0.75rem; font-weight: 500; color: var(--success); vertical-align: middle; margin-left: 4px;">(Supabase)</span>`;
        } else {
            countEl.innerHTML = `${state.customers.length} <span style="font-size: 0.75rem; font-weight: 500; color: var(--text-muted); vertical-align: middle; margin-left: 4px;">(Local)</span>`;
        }
    }
    
    const todayStr = now.toISOString().split('T')[0];
    const todaySales = state.purchases.filter(p => p.billDate === todayStr).length;
    document.getElementById('statSalesToday').textContent = todaySales;

    const totalIssued = state.customers.reduce((acc, c) => acc + c.pointsCurrent + c.pointsRedeemed, 0);
    document.getElementById('statTotalLoyaltyPoints').textContent = totalIssued;

    // Recent Customers
    const recentCustContainer = document.getElementById('dashRecentCustomersList');
    recentCustContainer.innerHTML = '';
    
    const sortedCustomers = [...state.customers].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 3);
    
    if (sortedCustomers.length === 0) {
        recentCustContainer.innerHTML = renderEmptyStateMarkup('No Customers', 'No customer records added yet.');
    } else {
        sortedCustomers.forEach(cust => {
            const avatarInitials = getInitials(cust.name);
            const rank = getCustomerRank(cust);
            const item = document.createElement('div');
            item.className = 'list-item';
            item.innerHTML = `
                <div class="item-main">
                    <div class="item-avatar">${avatarInitials}</div>
                    <div class="item-details">
                        <h4 class="clickable-profile-trigger" style="color:var(--primary);cursor:pointer;font-weight:600;" data-id="${cust.id}">${cust.name}</h4>
                        <p>Mobile: ${cust.mobile} | <span class="rank-badge ${rank.class}" style="margin-top:0;font-size:0.6rem;padding:1px 6px;">${rank.label}</span></p>
                    </div>
                </div>
                <div class="item-badge badge-success">${cust.pointsCurrent} Points</div>
            `;
            recentCustContainer.appendChild(item);
        });
    }

    // Reminders
    const upcomingContainer = document.getElementById('dashUpcomingRemindersList');
    upcomingContainer.innerHTML = '';
    
    const activeReminders = state.reminders
        .filter(r => r.status === 'Upcoming')
        .sort((a, b) => new Date(a.refillDate) - new Date(b.refillDate))
        .slice(0, 3);

    if (activeReminders.length === 0) {
        upcomingContainer.innerHTML = renderEmptyStateMarkup('No Reminders', 'No upcoming medication refills pending.');
    } else {
        activeReminders.forEach(rem => {
            const cust = state.customers.find(c => c.id === rem.customerId);
            if (!cust) return;
            
            const refillDateObj = new Date(rem.refillDate);
            const dateStr = refillDateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            
            const isOverdue = refillDateObj < new Date();
            const badgeClass = isOverdue ? 'badge-danger' : 'badge-warning';
            const badgeText = isOverdue ? 'Overdue' : 'Due';

            const item = document.createElement('div');
            item.className = 'list-item';
            item.innerHTML = `
                <div class="item-main">
                    <div class="item-avatar" style="background-color:var(--warning-light);color:var(--warning);">🗙</div>
                    <div class="item-details">
                        <h4 class="clickable-profile-trigger" style="color:var(--primary);cursor:pointer;" data-id="${cust.id}">${cust.name}</h4>
                        <p>Med: <strong>${rem.medicineName}</strong> (Qty: ${rem.quantity || 1})</p>
                    </div>
                </div>
                <div style="text-align:right; display:flex; flex-direction:column; align-items:flex-end; gap:4px;">
                    <div style="font-size:0.8rem;font-weight:700;">${dateStr}</div>
                    <div style="display:flex; gap:6px; align-items:center;">
                        <button type="button" class="btn btn-secondary send-whatsapp-reminder-btn" style="padding: 2px 6px; font-size: 0.7rem; height: auto;" data-phone="${cust.mobile}" data-med="${rem.medicineName}" data-cust-id="${cust.id}">WhatsApp</button>
                        <span class="item-badge ${badgeClass}">${badgeText}</span>
                    </div>
                </div>
            `;
            upcomingContainer.appendChild(item);
        });
    }

    renderDashboardLeaderboard();
    bindProfileTriggers();
}

function renderDashboardLeaderboard() {
    const tbody = document.getElementById('dashLeaderboardTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    let ranked = state.customers.map(c => {
        const custPurchases = state.purchases.filter(p => p.customerId === c.id);
        const totalSpent = custPurchases.reduce((acc, p) => acc + p.billAmount, 0);
        const rank = getCustomerRank(c);
        return {
            cust: c,
            purchasesCount: custPurchases.length,
            totalSpent,
            rank
        };
    });

    let filtered = ranked.filter(item => item.rank.class === 'rank-platinum' || item.rank.class === 'rank-gold');
    if (filtered.length === 0) {
        filtered = [...ranked];
    }

    filtered.sort((a, b) => b.cust.pointsCurrent - a.cust.pointsCurrent);
    const top5 = filtered.slice(0, 5);

    if (top5.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:16px;color:var(--text-muted);">No customer records to show rankings yet.</td></tr>`;
        return;
    }

    top5.forEach((item, index) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>#${index + 1}</strong></td>
            <td>
                <a class="clickable-profile-trigger" style="font-weight:600;color:var(--primary);cursor:pointer;text-decoration:none;" data-id="${item.cust.id}">${item.cust.name}</a>
            </td>
            <td style="font-family:monospace;">${item.cust.mobile}</td>
            <td><span class="rank-badge ${item.rank.class}">${item.rank.label}</span></td>
            <td><strong style="color:var(--warning);">${item.cust.pointsCurrent}</strong> pts</td>
            <td>${item.purchasesCount} bills (₹${item.totalSpent.toLocaleString('en-IN')})</td>
        `;
        tbody.appendChild(tr);
    });
}

// --- DYNAMIC RENDER: CUSTOMERS DATABASE ---
function renderCustomersList() {
    const tbody = document.getElementById('customersTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const searchInput = document.getElementById('customerSearchInput');
    const filterVal = searchInput ? searchInput.value.toLowerCase().trim() : '';
    
    const filtered = state.customers.filter(c => 
        (c.name || '').toLowerCase().includes(filterVal) || 
        (c.mobile || '').includes(filterVal)
    );

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-muted);">No matching customer records found.</td></tr>`;
        return;
    }

    filtered.forEach(cust => {
        const rank = getCustomerRank(cust);
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>
                <div style="display:flex;align-items:center;gap:12px;">
                    <div class="item-avatar" style="width:36px;height:36px;font-size:0.85rem;">${getInitials(cust.name)}</div>
                    <div>
                        <a class="clickable-profile-trigger" style="font-weight:600;color:var(--primary);cursor:pointer;text-decoration:none;" data-id="${cust.id}">${cust.name}</a>
                        <br><span class="rank-badge ${rank.class}" style="font-size:0.6rem;padding:0px 6px;margin-top:2px;">${rank.label}</span>
                    </div>
                </div>
            </td>
            <td style="font-family:monospace;font-weight:600;">${cust.mobile}</td>
            <td>${cust.age} Yrs / ${cust.gender}</td>
            <td>${cust.familyId || '<span style="color:var(--text-muted)">—</span>'}</td>
            <td><strong style="color:var(--primary);">${cust.pointsCurrent}</strong> <span style="font-size:0.8rem;color:var(--text-muted)">pts</span></td>
            <td style="text-align:right;">
                <div style="display:flex;gap:6px;justify-content:flex-end;">
                    <button type="button" class="btn btn-secondary btn-sm edit-customer-trigger" data-id="${cust.id}">Edit</button>
                    ${state.currentUser.role === 'Admin' ? `<button type="button" class="btn btn-danger btn-sm delete-customer-trigger" data-id="${cust.id}">Delete</button>` : ''}
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });

    bindProfileTriggers();
    
    // Bind Edit triggers
    document.querySelectorAll('.edit-customer-trigger').forEach(btn => {
        safeBind(btn, 'click', (e) => {
            const custId = e.currentTarget.getAttribute('data-id');
            openCustomerFormModal(custId);
        });
    });

    // Bind Delete triggers
    document.querySelectorAll('.delete-customer-trigger').forEach(btn => {
        safeBind(btn, 'click', (e) => {
            const custId = e.currentTarget.getAttribute('data-id');
            const cust = state.customers.find(c => c.id === custId);
            if (cust && confirm(`Are you absolutely sure you want to delete ${cust.name}'s profile? This will wipe all prescriptions and billing logs permanently.`)) {
                deleteCustomerProfile(custId);
            }
        });
    });
}

async function deleteCustomerProfile(custId) {
    const cust = state.customers.find(c => c.id === custId);
    const name = cust ? cust.name : 'Unknown';
    const mobile = cust ? cust.mobile : 'N/A';
    await removeCustomer(custId);
    await logActivity(`Deleted customer record for ${name} (Mobile: ${mobile})`);
    renderCustomersList();
    showToast('Customer record deleted successfully.', 'success');
}

// --- DYNAMIC RENDER: UNIFIED CUSTOMER PROFILE PAGE ---
function renderCustomerProfile(custId) {
    state.currentCustomerId = custId;
    const cust = state.customers.find(c => c.id === custId);
    if (!cust) {
        showToast('Patient not found.', 'danger');
        navigateToModule('customersModule');
        return;
    }

    // Set Personal Details
    document.getElementById('profileHeaderName').textContent = cust.name;
    document.getElementById('profileCardName').textContent = cust.name;
    document.getElementById('profileCardPhoneText').textContent = cust.mobile;
    document.getElementById('profileCardAvatar').textContent = getInitials(cust.name);
    document.getElementById('profilePointsBalance').textContent = cust.pointsCurrent;
    document.getElementById('profileCardDemographics').textContent = `${cust.age} Yrs / ${cust.gender}`;
    document.getElementById('profileCardFamilyId').textContent = cust.familyId || '—';
    document.getElementById('profileCardAddress').textContent = cust.address;

    // Set Rank Badge
    const rank = getCustomerRank(cust);
    let rankBadge = document.getElementById('profileCardRank');
    if (!rankBadge) {
        rankBadge = document.createElement('div');
        rankBadge.id = 'profileCardRank';
        document.getElementById('profileCardName').insertAdjacentElement('afterend', rankBadge);
    }
    rankBadge.innerHTML = `<span class="rank-badge ${rank.class}">${rank.label}</span>`;

    // Calculate Total Spend & Highlights
    const patientPurchases = state.purchases.filter(p => p.customerId === custId);
    const totalSpent = patientPurchases.reduce((acc, p) => acc + p.billAmount, 0);
    document.getElementById('profilePointsSpent').textContent = `₹${totalSpent.toLocaleString('en-IN')}`;
    document.getElementById('profileTotalSpentText').textContent = `₹${totalSpent.toLocaleString('en-IN')}`;
    document.getElementById('profileTotalPurchasesText').textContent = `${patientPurchases.length} bill${patientPurchases.length === 1 ? '' : 's'}`;
    document.getElementById('profileLoyaltyPointsText').textContent = `${cust.pointsCurrent} point${cust.pointsCurrent === 1 ? '' : 's'}`;

    // Get last purchase date
    if (patientPurchases.length > 0) {
        const sortedDates = [...patientPurchases].sort((a, b) => new Date(b.billDate) - new Date(a.billDate));
        const lastVisitDate = new Date(sortedDates[0].billDate);
        const dateStr = lastVisitDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        document.getElementById('profileCardLastVisit').textContent = dateStr;
        document.getElementById('profileLastPurchaseDateText').textContent = dateStr;
    } else {
        document.getElementById('profileCardLastVisit').textContent = 'No Purchases Logged';
        document.getElementById('profileLastPurchaseDateText').textContent = 'N/A';
    }

    // Set tab counts
    const patientRx = state.prescriptions.filter(r => r.customerId === custId);
    const patientReminders = state.reminders.filter(rem => rem.customerId === custId);
    
    document.getElementById('profileRxCount').textContent = patientRx.length;
    document.getElementById('profilePurchaseCount').textContent = patientPurchases.length;
    document.getElementById('profileReminderCount').textContent = patientReminders.length;

    // RENDER Modules
    renderUnifiedProfileTimeline(cust, patientPurchases, patientRx, patientReminders);
    renderProfileRxGallery(patientRx);
    renderProfilePurchasesTable(patientPurchases);
    renderProfileRemindersTable(patientReminders);

    navigateToModule('customerProfileModule');
}

function renderUnifiedProfileTimeline(cust, purchases, rx, reminders) {
    const container = document.getElementById('profileTimelineItems');
    if (!container) return;
    container.innerHTML = '';

    let events = [];

    // Add Profile Created
    events.push({
        type: 'profile_creation',
        date: cust.createdAt,
        title: 'Customer Profile Registered',
        body: `Patient database folder created with mobile ${cust.mobile} under name ${cust.name}.`
    });

    // Add Purchases
    purchases.forEach(pur => {
        events.push({
            type: 'purchase',
            date: pur.createdAt || `${pur.billDate}T12:00:00Z`,
            title: `Recorded Purchase (Bill: ${pur.billNumber})`,
            body: `Purchased: ${pur.medicines} (Qty: ${pur.quantity || 1}). Total Amount spent: <strong>₹${pur.billAmount}</strong>. Loyalty points earned: <strong>+${pur.pointsEarned}</strong>.`
        });
    });

    // Add Prescriptions
    rx.forEach(pres => {
        events.push({
            type: 'rx_upload',
            date: pres.createdAt || `${pres.rxDate}T12:00:00Z`,
            title: `Prescription Uploaded`,
            body: `Prescribed by <strong>${pres.doctorName}</strong>. Includes ${(pres.rxImages || []).length || 1} image scans. Notes: ${pres.notes || 'None.'}`
        });
    });

    // Add Refills Completed or Scheduled
    reminders.forEach(rem => {
        const isCompleted = rem.status === 'Completed';
        events.push({
            type: 'refill_schedule',
            date: rem.createdAt || `${rem.refillDate}T12:00:00Z`,
            title: isCompleted ? `Refill Completed Notification` : `Refill Scheduled`,
            body: `Refill target for <strong>${rem.medicineName}</strong> (Qty: ${rem.quantity || 1}, ${rem.daysSupply || 30} Days Supply) scheduled on <strong>${rem.refillDate}</strong>. Status: <strong>${rem.status}</strong>.`
        });
    });

    // Add loyalty redemptions
    if (cust.redeemedHistory) {
        cust.redeemedHistory.forEach(log => {
            events.push({
                type: 'loyalty_redemption',
                date: log.date,
                title: `Redeemed Loyalty Points`,
                body: `Spent <strong>-${log.points}</strong> points. Reason: ${log.reason}`
            });
        });
    }

    // Add WhatsApp history logs
    if (cust.whatsappReminders) {
        cust.whatsappReminders.forEach(log => {
            events.push({
                type: 'whatsapp_reminder',
                date: log.date,
                title: `WhatsApp Refill Reminder Sent`,
                body: `Sent WhatsApp alert message for regular medicines: <strong>${log.medicineName}</strong>.`
            });
        });
    }

    // Sort events descending
    events.sort((a, b) => new Date(b.date) - new Date(a.date));

    events.forEach(ev => {
        const dateObj = new Date(ev.date);
        const dateStr = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        
        const div = document.createElement('div');
        div.className = 'timeline-event';
        div.innerHTML = `
            <div class="timeline-event-header">
                <span class="timeline-event-title">${ev.title}</span>
                <span class="timeline-event-date">${dateStr}</span>
            </div>
            <div class="timeline-event-body">${ev.body}</div>
        `;
        container.appendChild(div);
    });
}

function renderProfileRxGallery(prescriptions) {
    const container = document.getElementById('profileRxGallery');
    if (!container) return;
    container.innerHTML = '';

    if (prescriptions.length === 0) {
        container.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:24px;color:var(--text-muted);">No prescription uploads found for this patient.</div>`;
        return;
    }

    prescriptions.forEach(rx => {
        const images = rx.rxImages || (rx.rxImage ? [rx.rxImage] : []);
        const firstImg = images[0] || defaultRxSvg;
        const div = document.createElement('div');
        div.className = 'card-panel';
        div.style.padding = '12px';
        div.style.gap = '10px';
        div.style.cursor = 'pointer';
        div.innerHTML = `
            <div style="height:120px;overflow:hidden;border-radius:var(--radius-sm);border:1px solid var(--border-color);background-color:var(--slate-100);display:flex;align-items:center;justify-content:center;">
                <img src="${firstImg}" style="width:100%;height:100%;object-fit:cover;" alt="Prescription snippet">
            </div>
            <div style="text-align:left;">
                <h5 style="font-size:0.8rem;font-weight:700;margin-bottom:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${rx.doctorName}</h5>
                <p style="font-size:0.7rem;color:var(--text-muted);">${rx.rxDate} (${images.length} pages)</p>
            </div>
        `;
        safeBind(div, 'click', () => triggerRxFullViewModal(rx));
        container.appendChild(div);
    });
}

function renderProfilePurchasesTable(purchases) {
    const tbody = document.getElementById('profilePurchasesTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (purchases.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text-muted);">No sales purchases logged yet.</td></tr>`;
        return;
    }

    purchases.sort((a, b) => new Date(b.billDate) - new Date(a.billDate)).forEach(p => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="font-weight:600;font-family:monospace;">${p.billNumber}</td>
            <td>${p.billDate}</td>
            <td style="max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${p.medicines}">${p.medicines} (Qty: ${p.quantity || 1})</td>
            <td style="font-weight:700;">₹${p.billAmount}</td>
            <td><strong style="color:var(--primary);">+${p.pointsEarned}</strong> pts</td>
            <td>
                ${p.billPhoto ? `
                    <button type="button" class="panel-action-btn view-bill-photo-btn" data-img="${p.billPhoto}">View Bill</button>
                ` : `<span style="color:var(--text-muted)">No Attachment</span>`}
            </td>
        `;
        tbody.appendChild(tr);
    });

    tbody.querySelectorAll('.view-bill-photo-btn').forEach(btn => {
        safeBind(btn, 'click', (e) => {
            const imgData = e.target.getAttribute('data-img');
            triggerRxFullViewModal({
                doctorName: 'Invoice Bill Attachment',
                rxDate: 'Scanned Proof',
                rxImages: [imgData],
                notes: 'Uploaded proof of invoice bill.'
            });
        });
    });
}

function renderProfileRemindersTable(reminders) {
    const tbody = document.getElementById('profileRemindersTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (reminders.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text-muted);">No medication refills scheduled.</td></tr>`;
        return;
    }

    const cust = state.customers.find(c => c.id === state.currentCustomerId);

    reminders.sort((a, b) => new Date(a.refillDate) - new Date(b.refillDate)).forEach(rem => {
        const isCompleted = rem.status === 'Completed';
        const badgeClass = isCompleted ? 'badge-success' : 'badge-warning';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${rem.medicineName}</strong> <span style="font-size:0.75rem;color:var(--text-muted);">(Qty: ${rem.quantity || 1}, ${rem.daysSupply || 30} Days Supply)</span></td>
            <td>
                <div>Due: ${rem.refillDate}</div>
                <div style="font-size:0.75rem;color:var(--text-muted);">Expiry: ${rem.expectedRefillDate || rem.refillDate}</div>
            </td>
            <td><span class="item-badge ${badgeClass}">${rem.status}</span></td>
            <td style="text-align:right;">
                <div style="display:flex;gap:6px;justify-content:flex-end;align-items:center;">
                    <button type="button" class="btn btn-secondary btn-sm send-whatsapp-reminder-btn" data-phone="${cust ? cust.mobile : ''}" data-med="${rem.medicineName}" data-cust-id="${cust ? cust.id : ''}">WhatsApp</button>
                    ${!isCompleted ? `
                        <button type="button" class="btn btn-primary btn-sm complete-reminder-trigger" data-id="${rem.id}">Mark Completed</button>
                    ` : `<span style="color:var(--success);font-weight:600;font-size:0.8rem;">Refilled ✓</span>`}
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });

    tbody.querySelectorAll('.complete-reminder-trigger').forEach(btn => {
        safeBind(btn, 'click', (e) => {
            const remId = e.target.getAttribute('data-id');
            markReminderAsCompleted(remId);
        });
    });
}

async function markReminderAsCompleted(remId) {
    const rem = state.reminders.find(r => r.id === remId);
    if (!rem) return;
    
    rem.status = 'Completed';
    
    const cust = state.customers.find(c => c.id === rem.customerId);
    if (cust) {
        cust.pointsCurrent += 5;
        await saveCustomer(cust);
        showToast('Refill processed successfully! Awarded +5 loyalty points to patient account.', 'success');
    } else {
        showToast('Refill marked completed!', 'success');
    }

    await saveReminder(rem);
    await logActivity(`Marked refill reminder for ${rem.medicineName} as completed for ${cust ? cust.name : 'Unknown customer'}`);
    renderCustomerProfile(state.currentCustomerId);
}

// --- DYNAMIC RENDER: PRESCRIPTIONS MODULE ---
function renderPrescriptionsModule() {
    const gallery = document.getElementById('rxGlobalGallery');
    if (!gallery) return;
    gallery.innerHTML = '';

    if (state.prescriptions.length === 0) {
        gallery.innerHTML = `<div style="grid-column:1/-1;width:100%;">${renderEmptyStateMarkup('No Prescriptions', 'Safely upload scanned patient scripts.')}</div>`;
        return;
    }

    state.prescriptions.sort((a, b) => new Date(b.rxDate) - new Date(a.rxDate)).forEach(rx => {
        const cust = state.customers.find(c => c.id === rx.customerId);
        if (!cust) return;

        const images = rx.rxImages || (rx.rxImage ? [rx.rxImage] : []);
        const firstImg = images[0] || defaultRxSvg;

        const div = document.createElement('div');
        div.className = 'card-panel';
        div.style.padding = '14px';
        div.style.gap = '10px';
        div.style.cursor = 'pointer';
        div.innerHTML = `
            <div style="height:150px;overflow:hidden;border-radius:var(--radius-sm);border:1px solid var(--border-color);background-color:var(--slate-100);display:flex;align-items:center;justify-content:center;">
                <img src="${firstImg}" style="width:100%;height:100%;object-fit:cover;" alt="Prescription Scans">
            </div>
            <div style="text-align:left;">
                <h4 style="font-size:0.9rem;font-weight:700;margin-bottom:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${cust.name}</h4>
                <h5 style="font-size:0.8rem;font-weight:600;color:var(--text-muted);margin-bottom:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">Doctor: ${rx.doctorName}</h5>
                <div style="display:flex;justify-content:space-between;align-items:center;">
                    <span style="font-size:0.75rem;color:var(--text-muted);">${rx.rxDate} (${images.length} pages)</span>
                    <span class="panel-action-btn" style="font-size:0.65rem;padding:4px 8px;">View Detail</span>
                </div>
            </div>
        `;
        safeBind(div, 'click', () => triggerRxFullViewModal(rx));
        gallery.appendChild(div);
    });
}

function triggerRxFullViewModal(rx) {
    activeViewingRx = rx;
    document.getElementById('viewRxModalTitle').textContent = rx.doctorName;
    document.getElementById('viewRxMeta').textContent = `Prescription Date: ${rx.rxDate}`;
    document.getElementById('viewRxNotes').innerHTML = `<strong>Pharmacist Guidelines:</strong><p style="margin-top:4px;">${rx.notes || 'No specific dosage guidelines or notes logged.'}</p>`;

    const gallery = document.getElementById('viewRxImageGallery');
    if (gallery) {
        gallery.innerHTML = '';
        const images = rx.rxImages || (rx.rxImage ? [rx.rxImage] : []);
        images.forEach((imgSrc, index) => {
            const thumb = document.createElement('div');
            thumb.className = 'thumbnail-preview-item';
            thumb.style.width = '70px';
            thumb.style.height = '70px';
            thumb.innerHTML = `<img src="${imgSrc}" alt="Page ${index + 1}">`;
            
            safeBind(thumb, 'click', () => zoomImage(imgSrc));
            gallery.appendChild(thumb);
        });
    }

    openModal('viewPrescriptionModal');
}

// PDF Export helper via jsPDF
function generatePDFFromImages(imagesArray) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: 'a4'
    });
    
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    
    imagesArray.forEach((imgBase64, index) => {
        if (index > 0) {
            doc.addPage();
        }
        
        const margin = 10;
        const targetWidth = pageWidth - (margin * 2);
        const targetHeight = pageHeight - (margin * 2);
        
        doc.addImage(imgBase64, 'JPEG', margin, margin, targetWidth, targetHeight, undefined, 'FAST');
    });
    
    return doc.output('datauristring');
}

function downloadRxPdf() {
    if (!activeViewingRx) return;
    try {
        let pdfData = activeViewingRx.pdfData;
        const images = activeViewingRx.rxImages || (activeViewingRx.rxImage ? [activeViewingRx.rxImage] : []);
        
        if (images.length === 0) {
            showToast('No images available to generate PDF.', 'warning');
            return;
        }

        if (!pdfData) {
            pdfData = generatePDFFromImages(images);
        }
        
        const link = document.createElement('a');
        link.href = pdfData;
        link.download = `Prescription_${activeViewingRx.doctorName.replace(/\s+/g, '_')}_${activeViewingRx.rxDate}.pdf`;
        link.click();
        showToast('PDF downloaded successfully!', 'success');
    } catch (e) {
        console.error('Error generating/downloading PDF:', e);
        showToast('Failed to download PDF summary.', 'danger');
    }
}

// --- DYNAMIC RENDER: PURCHASES SALES LOG ---
function renderPurchasesModule() {
    const tbody = document.getElementById('purchasesGlobalTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (state.purchases.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text-muted);">No billing invoice transactions entered yet.</td></tr>`;
        return;
    }

    state.purchases.sort((a, b) => new Date(b.billDate) - new Date(a.billDate)).forEach(p => {
        const cust = state.customers.find(c => c.id === p.customerId);
        if (!cust) return;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="font-weight:600;font-family:monospace;">${p.billNumber}</td>
            <td>${p.billDate}</td>
            <td>
                <a class="clickable-profile-trigger" style="font-weight:600;color:var(--primary);cursor:pointer;text-decoration:none;" data-id="${cust.id}">${cust.name}</a>
            </td>
            <td style="max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${p.medicines}">${p.medicines} (Qty: ${p.quantity || 1})</td>
            <td style="font-weight:700;">₹${p.billAmount.toLocaleString('en-IN')}</td>
            <td><strong style="color:var(--primary);">+${p.pointsEarned}</strong> pts</td>
            <td>
                ${p.billPhoto ? `
                    <button type="button" class="panel-action-btn view-bill-photo-btn" data-img="${p.billPhoto}">View Attachment</button>
                ` : `<span style="color:var(--text-muted)">—</span>`}
            </td>
        `;
        tbody.appendChild(tr);
    });

    bindProfileTriggers();
    
    // Bind bill photo click
    tbody.querySelectorAll('.view-bill-photo-btn').forEach(btn => {
        safeBind(btn, 'click', (e) => {
            const imgData = e.target.getAttribute('data-img');
            triggerRxFullViewModal({
                doctorName: 'Invoice Bill Attachment',
                rxDate: 'Scanned Proof',
                rxImages: [imgData],
                notes: 'Uploaded proof of invoice bill.'
            });
        });
    });
}

// --- DYNAMIC RENDER: REMINDERS SCHEDULES ---
function renderRemindersModule() {
    const tbody = document.getElementById('remindersGlobalTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (state.reminders.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-muted);">No patient medication refill reminders configured.</td></tr>`;
        return;
    }

    state.reminders.sort((a, b) => new Date(a.refillDate) - new Date(b.refillDate)).forEach(rem => {
        const cust = state.customers.find(c => c.id === rem.customerId);
        if (!cust) return;

        const isCompleted = rem.status === 'Completed';
        const badgeClass = isCompleted ? 'badge-success' : 'badge-warning';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>
                <a class="clickable-profile-trigger" style="font-weight:600;color:var(--primary);cursor:pointer;text-decoration:none;" data-id="${cust.id}">${cust.name}</a>
            </td>
            <td style="font-family:monospace;">${cust.mobile}</td>
            <td><strong>${rem.medicineName}</strong> <span style="font-size:0.75rem;color:var(--text-muted);">(Qty: ${rem.quantity || 1})</span></td>
            <td>
                <div>Due: ${rem.refillDate}</div>
                <div style="font-size:0.75rem;color:var(--text-muted);">Expiry: ${rem.expectedRefillDate || rem.refillDate}</div>
            </td>
            <td><span class="item-badge ${badgeClass}">${rem.status}</span></td>
            <td style="text-align:right;">
                <div style="display:flex;gap:6px;justify-content:flex-end;align-items:center;">
                    <button type="button" class="btn btn-secondary btn-sm send-whatsapp-reminder-btn" data-phone="${cust.mobile}" data-med="${rem.medicineName}" data-cust-id="${cust.id}">WhatsApp</button>
                    ${!isCompleted ? `
                        <button type="button" class="btn btn-primary btn-sm complete-reminder-trigger" data-id="${rem.id}">Complete</button>
                    ` : `<span style="color:var(--success);font-weight:600;font-size:0.8rem;">Refilled ✓</span>`}
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });

    bindProfileTriggers();

    tbody.querySelectorAll('.complete-reminder-trigger').forEach(btn => {
        safeBind(btn, 'click', (e) => {
            const remId = e.target.getAttribute('data-id');
            markReminderAsCompletedGlobal(remId);
        });
    });
}

async function markReminderAsCompletedGlobal(remId) {
    const rem = state.reminders.find(r => r.id === remId);
    if (!rem) return;
    
    rem.status = 'Completed';
    
    const cust = state.customers.find(c => c.id === rem.customerId);
    if (cust) {
        cust.pointsCurrent += 5;
        await saveCustomer(cust);
        showToast('On-time medication refill logged! +5 Loyalty points awarded.', 'success');
    } else {
        showToast('Refill marked completed!', 'success');
    }

    await saveReminder(rem);
    await logActivity(`Marked refill reminder for ${rem.medicineName} as completed for ${cust ? cust.name : 'Unknown customer'}`);
    renderRemindersModule();
}

// --- DYNAMIC RENDER: ANALYTICS & REPORTS ---
function renderReportsModule() {
    const totalIssued = state.customers.reduce((acc, c) => acc + c.pointsCurrent + c.pointsRedeemed, 0);
    document.getElementById('reportTotalPoints').textContent = totalIssued;

    const totalSales = state.purchases.reduce((acc, p) => acc + p.billAmount, 0);
    const avgSpend = state.purchases.length > 0 ? (totalSales / state.purchases.length) : 0;
    document.getElementById('reportAverageSpend').textContent = `₹${avgSpend.toFixed(2)}`;

    renderTopSpendersChart();
    renderMostFrequentVisitorsChart();
    renderMonthlyRegistrationsChart();
    renderLoyaltyPointsDistributionChart();
}

function renderTopSpendersChart() {
    const chartDiv = document.getElementById('reportTopSpendersChart');
    if (!chartDiv) return;
    chartDiv.innerHTML = '';

    let spendMap = state.customers.map(c => {
        const custSpend = state.purchases
            .filter(p => p.customerId === c.id)
            .reduce((acc, p) => acc + p.billAmount, 0);
        return { name: c.name, amount: custSpend };
    });

    spendMap.sort((a, b) => b.amount - a.amount);
    const topSpenders = spendMap.slice(0, 5).filter(s => s.amount > 0);

    if (topSpenders.length === 0) {
        chartDiv.innerHTML = '<p style="color:var(--text-muted);font-size:0.9rem;text-align:center;padding:24px;">No purchase bills registered yet.</p>';
        return;
    }

    const maxAmt = Math.max(...topSpenders.map(s => s.amount));

    topSpenders.forEach(item => {
        const widthPct = maxAmt > 0 ? (item.amount / maxAmt) * 100 : 0;
        const row = document.createElement('div');
        row.className = 'chart-bar-row';
        row.innerHTML = `
            <div class="chart-bar-label" title="${item.name}">${item.name}</div>
            <div class="chart-bar-progress-wrapper">
                <div class="chart-bar-progress-filled" style="width: ${widthPct}%;"></div>
            </div>
            <div class="chart-bar-value">₹${item.amount.toLocaleString('en-IN')}</div>
        `;
        chartDiv.appendChild(row);
    });
}

function renderMostFrequentVisitorsChart() {
    const chartDiv = document.getElementById('reportTopFrequentChart');
    if (!chartDiv) return;
    chartDiv.innerHTML = '';

    let visitMap = state.customers.map(c => {
        const custVisits = state.purchases.filter(p => p.customerId === c.id).length;
        return { name: c.name, visits: custVisits };
    });

    visitMap.sort((a, b) => b.visits - a.visits);
    const topFrequent = visitMap.slice(0, 5).filter(s => s.visits > 0);

    if (topFrequent.length === 0) {
        chartDiv.innerHTML = '<p style="color:var(--text-muted);font-size:0.9rem;text-align:center;padding:24px;">No visits or sales entries logged yet.</p>';
        return;
    }

    const maxVisits = Math.max(...topFrequent.map(s => s.visits));

    topFrequent.forEach(item => {
        const widthPct = maxVisits > 0 ? (item.visits / maxVisits) * 100 : 0;
        const row = document.createElement('div');
        row.className = 'chart-bar-row';
        row.innerHTML = `
            <div class="chart-bar-label" title="${item.name}">${item.name}</div>
            <div class="chart-bar-progress-wrapper">
                <div class="chart-bar-progress-filled" style="width: ${widthPct}%; background: linear-gradient(90deg, var(--info) 0%, var(--primary) 100%);"></div>
            </div>
            <div class="chart-bar-value">${item.visits} visit${item.visits > 1 ? 's' : ''}</div>
        `;
        chartDiv.appendChild(row);
    });
}

function renderMonthlyRegistrationsChart() {
    const chartDiv = document.getElementById('reportMonthlyRegistrationsChart');
    if (!chartDiv) return;
    chartDiv.innerHTML = '';

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    let monthlyCounts = {};

    state.customers.forEach(c => {
        const d = new Date(c.createdAt);
        const mKey = `${months[d.getMonth()]} ${d.getFullYear().toString().substr(-2)}`;
        monthlyCounts[mKey] = (monthlyCounts[mKey] || 0) + 1;
    });

    const sortedMonths = Object.keys(monthlyCounts).map(k => {
        return { label: k, count: monthlyCounts[k] };
    });

    if (sortedMonths.length === 0) {
        chartDiv.innerHTML = '<p style="color:var(--text-muted);font-size:0.9rem;text-align:center;padding:24px;">No customer directories registered yet.</p>';
        return;
    }

    const maxCount = Math.max(...sortedMonths.map(s => s.count));

    sortedMonths.forEach(item => {
        const widthPct = maxCount > 0 ? (item.count / maxCount) * 100 : 0;
        const row = document.createElement('div');
        row.className = 'chart-bar-row';
        row.innerHTML = `
            <div class="chart-bar-label">${item.label}</div>
            <div class="chart-bar-progress-wrapper">
                <div class="chart-bar-progress-filled" style="width: ${widthPct}%; background: var(--primary);"></div>
            </div>
            <div class="chart-bar-value">${item.count} reg</div>
        `;
        chartDiv.appendChild(row);
    });
}

function renderLoyaltyPointsDistributionChart() {
    const chartDiv = document.getElementById('reportTopPointsChart');
    if (!chartDiv) return;
    chartDiv.innerHTML = '';

    let pointsMap = state.customers.map(c => {
        return { name: c.name, points: c.pointsCurrent };
    });

    pointsMap.sort((a, b) => b.points - a.points);
    const topPoints = pointsMap.slice(0, 5).filter(s => s.points > 0);

    if (topPoints.length === 0) {
        chartDiv.innerHTML = '<p style="color:var(--text-muted);font-size:0.9rem;text-align:center;padding:24px;">No loyalty points issued yet.</p>';
        return;
    }

    const maxPoints = Math.max(...topPoints.map(s => s.points));

    topPoints.forEach(item => {
        const widthPct = maxPoints > 0 ? (item.points / maxPoints) * 100 : 0;
        const row = document.createElement('div');
        row.className = 'chart-bar-row';
        row.innerHTML = `
            <div class="chart-bar-label" title="${item.name}">${item.name}</div>
            <div class="chart-bar-progress-wrapper">
                <div class="chart-bar-progress-filled" style="width: ${widthPct}%; background: linear-gradient(90deg, var(--warning) 0%, var(--primary) 100%);"></div>
            </div>
            <div class="chart-bar-value">${item.points} pts</div>
        `;
        chartDiv.appendChild(row);
    });
}

// --- GLOBAL SEARCH LOGIC ---
function setupGlobalSearch() {
    const input = document.getElementById('globalPatientSearch');
    const overlay = document.getElementById('globalSearchResults');
    if (!input || !overlay) return;

    safeBind(input, 'input', function() {
        const val = this.value.toLowerCase().trim();
        if (val.length < 2) {
            overlay.classList.remove('active');
            overlay.innerHTML = '';
            return;
        }

        const matches = state.customers.filter(c => 
            (c.name || '').toLowerCase().includes(val) || 
            (c.mobile || '').includes(val)
        );

        if (matches.length === 0) {
            overlay.innerHTML = `<div style="padding:16px;text-align:center;color:var(--text-muted);font-size:0.85rem;">No patient matched "${this.value}"</div>`;
            overlay.classList.add('active');
            return;
        }

        overlay.innerHTML = '';
        overlay.classList.add('active');
        
        matches.forEach(cust => {
            const item = document.createElement('div');
            item.className = 'search-result-item';
            item.innerHTML = `
                <div class="search-result-info">
                    <h5>${cust.name}</h5>
                    <p>Mobile: ${cust.mobile} | Age: ${cust.age}</p>
                </div>
                <div class="search-result-meta">
                    <span class="search-result-points">${cust.pointsCurrent} Points</span>
                </div>
            `;
            safeBind(item, 'click', () => {
                input.value = '';
                overlay.classList.remove('active');
                renderCustomerProfile(cust.id);
            });
            overlay.appendChild(item);
        });
    });

    safeBind(document, 'click', (e) => {
        if (!input.contains(e.target) && !overlay.contains(e.target)) {
            overlay.classList.remove('active');
        }
    });
}

function setupDashboardSearch() {
    const input = document.getElementById('dashboardPatientSearch');
    const overlay = document.getElementById('dashboardSearchResults');
    if (!input || !overlay) return;

    safeBind(input, 'input', function() {
        const val = this.value.toLowerCase().trim();
        if (val.length < 2) {
            overlay.classList.remove('active');
            overlay.innerHTML = '';
            return;
        }

        const matches = state.customers.filter(c => 
            (c.name || '').toLowerCase().includes(val) || 
            (c.mobile || '').includes(val)
        );

        if (matches.length === 0) {
            overlay.innerHTML = `<div style="padding:16px;text-align:center;color:var(--text-muted);font-size:0.85rem;">No patient matched "${this.value}"</div>`;
            overlay.classList.add('active');
            return;
        }

        overlay.innerHTML = '';
        overlay.classList.add('active');
        
        matches.forEach(cust => {
            const item = document.createElement('div');
            item.className = 'search-result-item';
            item.innerHTML = `
                <div class="search-result-info">
                    <h5>${cust.name}</h5>
                    <p>Mobile: ${cust.mobile} | Age: ${cust.age}</p>
                </div>
                <div class="search-result-meta">
                    <span class="search-result-points">${cust.pointsCurrent} Points</span>
                </div>
            `;
            safeBind(item, 'click', () => {
                input.value = '';
                overlay.classList.remove('active');
                renderCustomerProfile(cust.id);
            });
            overlay.appendChild(item);
        });
    });

    safeBind(document, 'click', (e) => {
        if (!input.contains(e.target) && !overlay.contains(e.target)) {
            overlay.classList.remove('active');
        }
    });
}

// --- CORE FORMS & DATA SUBMISSION PROCEDURES ---

// 1. ADD / EDIT CUSTOMER
function openCustomerFormModal(custId = null) {
    const form = document.getElementById('customerForm');
    if (!form) return;
    form.reset();

    if (custId) {
        document.getElementById('customerModalTitle').textContent = 'Edit Customer Profile Details';
        const cust = state.customers.find(c => c.id === custId);
        if (!cust) return;

        document.getElementById('customerFormIndex').value = custId;
        document.getElementById('custName').value = cust.name;
        document.getElementById('custMobile').value = cust.mobile;
        document.getElementById('custAge').value = cust.age;
        document.getElementById('custGender').value = cust.gender;
        document.getElementById('custFamilyId').value = cust.familyId || '';
        document.getElementById('custAddress').value = cust.address;
    } else {
        document.getElementById('customerModalTitle').textContent = 'Add New Customer Profile';
        document.getElementById('customerFormIndex').value = '';
    }

    openModal('customerFormModal');
}

async function handleCustomerFormSubmit(e) {
    e.preventDefault();
    console.log("Customer form submission detected. Validating inputs...");
    try {
        const custId = document.getElementById('customerFormIndex').value;
        const name = document.getElementById('custName').value.trim();
        const mobile = document.getElementById('custMobile').value.trim();
        const age = parseInt(document.getElementById('custAge').value);
        const gender = document.getElementById('custGender').value;
        const familyId = document.getElementById('custFamilyId').value.trim();
        const address = document.getElementById('custAddress').value.trim();

        if (!name || !mobile || isNaN(age) || !gender || !address) {
            showToast('Please fill out all required fields.', 'warning');
            return;
        }

        if (!/^\d{10}$/.test(mobile)) {
            showToast('Please enter a valid 10-digit mobile number.', 'warning');
            return;
        }

        const exists = state.customers.find(c => c.mobile === mobile && c.id !== custId);
        if (exists) {
            showToast(`Mobile number ${mobile} is already registered to customer "${exists.name}".`, 'danger');
            return;
        }

        let targetId = custId;
        if (custId) {
            // Update Customer
            const cust = state.customers.find(c => c.id === custId);
            cust.name = name;
            cust.mobile = mobile;
            cust.age = age;
            cust.gender = gender;
            cust.familyId = familyId;
            cust.address = address;
            
            console.log("Initiating IndexedDB update for customer:", cust);
            await saveCustomer(cust);
            await logActivity(`Edited customer record for ${name} (Mobile: ${mobile})`);
            showToast('Customer profile updated successfully!', 'success');
            targetId = cust.id;
        } else {
            // Create Customer
            const newCust = {
                id: `cust-${Date.now()}`,
                name,
                mobile,
                age,
                gender,
                address,
                familyId,
                pointsCurrent: 0,
                pointsRedeemed: 0,
                createdAt: new Date().toISOString(),
                redeemedHistory: [],
                whatsappReminders: []
            };
            console.log("Initiating IndexedDB insert for new customer:", newCust);
            await saveCustomer(newCust);
            await logActivity(`Created customer record for ${name} (Mobile: ${mobile})`);
            showToast(`Patient ${name} registered successfully!`, 'success');
            targetId = newCust.id;
        }

        console.log("Database write successful. Refreshing UI lists...");
        closeModal('customerFormModal');

        // Reload active view
        const activeModuleId = document.querySelector('.app-module.active').id;
        if (activeModuleId === 'dashboardModule') renderDashboard();
        else if (activeModuleId === 'customersModule') renderCustomersList();
        else if (activeModuleId === 'customerProfileModule') renderCustomerProfile(targetId);

    } catch (err) {
        console.error("Critical error in customer form submit:", err);
        showToast("Failed to save patient profile database record.", "danger");
    }
}

// 2. UPLOAD PRESCRIPTION LOGIC
function openPrescriptionUploadModal(defaultCustId = null) {
    const form = document.getElementById('prescriptionForm');
    if (!form) return;
    form.reset();

    currentPrescriptionImages = [];
    renderPrescriptionUploadThumbnails();
    
    document.getElementById('rxDate').value = new Date().toISOString().split('T')[0];

    // Populate patient selector dropdown
    const select = document.getElementById('rxCustomerSearch');
    select.innerHTML = '<option value="" disabled selected>Select Patient Profile Account</option>';
    
    state.customers.forEach(c => {
        const option = document.createElement('option');
        option.value = c.id;
        option.textContent = `${c.name} (${c.mobile})`;
        if (defaultCustId && c.id === defaultCustId) option.selected = true;
        select.appendChild(option);
    });

    openModal('prescriptionFormModal');
}

async function handlePrescriptionSubmit(e) {
    e.preventDefault();
    console.log("Prescription form submission detected. Validating inputs...");
    try {
        const customerId = document.getElementById('rxCustomerSearch').value;
        const rxDate = document.getElementById('rxDate').value;
        const doctorName = document.getElementById('rxDoctor').value.trim();
        const rxNotes = document.getElementById('rxNotes').value.trim();

        if (!customerId) {
            showToast('Please select a patient.', 'warning');
            return;
        }

        if (!doctorName) {
            showToast('Please enter the doctor name.', 'warning');
            return;
        }

        if (currentPrescriptionImages.length === 0) {
            showToast('Please attach at least one prescription image scan.', 'warning');
            return;
        }

        // Auto-compile A4 PDF bundle client-side
        const pdfDataString = generatePDFFromImages(currentPrescriptionImages);

        const newRx = {
            id: `rx-${Date.now()}`,
            customerId,
            rxDate,
            doctorName,
            rxImages: [...currentPrescriptionImages],
            pdfData: pdfDataString, 
            notes: rxNotes,
            createdAt: new Date().toISOString()
        };

        console.log("Initiating IndexedDB insert for prescription:", newRx);
        await savePrescription(newRx);
        const cust = state.customers.find(c => c.id === customerId);
        await logActivity(`Uploaded prescription for ${cust ? cust.name : 'Unknown customer'} (Doctor: ${doctorName})`);
        
        console.log("Prescription database write successful. Refreshing UI lists...");
        showToast('Prescription images compiled and saved successfully!', 'success');
        closeModal('prescriptionFormModal');

        // Refresh view
        const activeModuleId = document.querySelector('.app-module.active').id;
        if (activeModuleId === 'prescriptionsModule') renderPrescriptionsModule();
        else if (activeModuleId === 'customerProfileModule') renderCustomerProfile(state.currentCustomerId || customerId);
    } catch (err) {
        console.error("Critical error in prescription form submit:", err);
        showToast("Failed to save prescription database record.", "danger");
    }
}

// 3. RECORD SALES & PURCHASE LOGIC
function openAddPurchaseModal(defaultCustId = null) {
    const form = document.getElementById('purchaseForm');
    if (!form) return;
    form.reset();

    resetImageUploadPreview('purUploadPromptIcon', 'purUploadPromptText', 'purImagePreview');
    document.getElementById('purBillDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('purBillNumber').value = `INV-${Date.now().toString().substr(-6)}`;
    document.getElementById('purPointsPreview').textContent = '0 pts';

    // Populate patient selector dropdown
    const select = document.getElementById('purCustomerSearch');
    select.innerHTML = '<option value="" disabled selected>Select Patient Profile Account</option>';
    
    state.customers.forEach(c => {
        const option = document.createElement('option');
        option.value = c.id;
        option.textContent = `${c.name} (${c.mobile})`;
        if (defaultCustId && c.id === defaultCustId) option.selected = true;
        select.appendChild(option);
    });

    openModal('purchaseFormModal');
}

async function handlePurchaseSubmit(e) {
    e.preventDefault();
    console.log("Purchase form submission detected. Validating inputs...");
    try {
        const customerId = document.getElementById('purCustomerSearch').value;
        const billNumber = document.getElementById('purBillNumber').value.trim();
        const billDate = document.getElementById('purBillDate').value;
        const medicines = document.getElementById('purMedicines').value.trim();
        const quantity = parseInt(document.getElementById('purQuantity').value) || 1;
        const billAmountVal = document.getElementById('purBillAmount').value;
        const billAmount = parseFloat(billAmountVal);
        const billPhotoPreview = document.getElementById('purImagePreview');

        if (!customerId) {
            showToast('Please select a patient.', 'warning');
            return;
        }

        if (!billNumber) {
            showToast('Please enter the bill number.', 'warning');
            return;
        }

        if (!medicines) {
            showToast('Please enter the medicine details.', 'warning');
            return;
        }

        if (isNaN(billAmount) || billAmount <= 0) {
            showToast('Please enter a valid bill amount greater than 0.', 'warning');
            return;
        }

        // Loyalty Point Rule
        const pointRule = state.settings.rupeesPerPoint || 100;
        const pointsEarned = Math.floor(billAmount / pointRule);

        const newPurchase = {
            id: `pur-${Date.now()}`,
            customerId,
            billNumber,
            billDate,
            billAmount,
            billPhoto: billPhotoPreview.style.display !== 'none' ? billPhotoPreview.src : '',
            medicines,
            quantity,
            pointsEarned,
            createdAt: new Date().toISOString()
        };

        // Update customer points
        const cust = state.customers.find(c => c.id === customerId);
        if (cust) {
            cust.pointsCurrent += pointsEarned;
            console.log("Updating customer points in database:", cust);
            await saveCustomer(cust);
        }

        console.log("Initiating IndexedDB insert for purchase:", newPurchase);
        await savePurchase(newPurchase);
        await logActivity(`Added purchase invoice ${billNumber} of amount ₹${billAmount} for ${cust ? cust.name : 'Unknown customer'}`);
        
        console.log("Purchase database write successful. Refreshing UI lists...");
        showToast(`Invoice saved! Rewarded customer ${cust ? cust.name : ''} with +${pointsEarned} loyalty points!`, 'success');
        closeModal('purchaseFormModal');

        // Refresh active view
        const activeModuleId = document.querySelector('.app-module.active').id;
        if (activeModuleId === 'dashboardModule') renderDashboard();
        else if (activeModuleId === 'purchasesModule') renderPurchasesModule();
        else if (activeModuleId === 'customerProfileModule') renderCustomerProfile(state.currentCustomerId || customerId);
    } catch (err) {
        console.error("Critical error in purchase form submit:", err);
        showToast("Failed to save purchase bill database record.", "danger");
    }
}

// 4. SCHEDULE MEDICATION REFILL
function openRefillReminderModal(defaultCustId = null) {
    const form = document.getElementById('reminderForm');
    if (!form) return;
    form.reset();

    // Populate patient selector dropdown
    const select = document.getElementById('remCustomerSearch');
    select.innerHTML = '<option value="" disabled selected>Select Patient Profile Account</option>';
    
    state.customers.forEach(c => {
        const option = document.createElement('option');
        option.value = c.id;
        option.textContent = `${c.name} (${c.mobile})`;
        if (defaultCustId && c.id === defaultCustId) option.selected = true;
        select.appendChild(option);
    });

    document.getElementById('remExpectedDate').value = '';
    document.getElementById('remDate').value = '';

    openModal('reminderFormModal');
}

async function handleReminderSubmit(e) {
    e.preventDefault();
    console.log("Reminder form submission detected. Validating inputs...");
    try {
        const customerId = document.getElementById('remCustomerSearch').value;
        const medicineName = document.getElementById('remMedicine').value.trim();
        const quantity = parseInt(document.getElementById('remQuantity').value) || 30;
        const daysSupply = parseInt(document.getElementById('remDaysSupply').value) || 30;
        const expectedRefillDate = document.getElementById('remExpectedDate').value;
        const refillDate = document.getElementById('remDate').value;

        if (!customerId || !medicineName || !refillDate || !expectedRefillDate) {
            showToast('Please fill out all required fields.', 'warning');
            return;
        }

        const newReminder = {
            id: `rem-${Date.now()}`,
            customerId,
            medicineName,
            quantity,
            daysSupply,
            expectedRefillDate,
            refillDate,
            status: 'Upcoming',
            createdAt: new Date().toISOString()
        };

        console.log("Initiating IndexedDB insert for reminder:", newReminder);
        await saveReminder(newReminder);
        const cust = state.customers.find(c => c.id === customerId);
        await logActivity(`Created refill reminder for ${medicineName} (Expected: ${refillDate}) for ${cust ? cust.name : 'Unknown customer'}`);

        console.log("Reminder database write successful. Refreshing UI lists...");
        showToast(`Refill Reminder scheduled successfully!`, 'success');
        closeModal('reminderFormModal');

        // Refresh view
        const activeModuleId = document.querySelector('.app-module.active').id;
        if (activeModuleId === 'dashboardModule') renderDashboard();
        else if (activeModuleId === 'remindersModule') renderRemindersModule();
        else if (activeModuleId === 'customerProfileModule') renderCustomerProfile(state.currentCustomerId || customerId);
    } catch (err) {
        console.error("Critical error in reminder form submit:", err);
        showToast("Failed to save refill reminder database record.", "danger");
    }
}

// 5. REDEEM LOYALTY POINTS FORM
function openRedeemPointsModal(custId) {
    const cust = state.customers.find(c => c.id === custId);
    if (!cust) return;

    const form = document.getElementById('redeemPointsForm');
    if (!form) return;
    form.reset();

    document.getElementById('redeemCustomerIndex').value = custId;
    document.getElementById('redeemAvailablePointsText').textContent = cust.pointsCurrent;
    document.getElementById('redeemPointsQty').max = cust.pointsCurrent;

    openModal('redeemPointsModal');
}

async function handleRedeemPointsSubmit(e) {
    e.preventDefault();
    console.log("Redeem loyalty points form submission detected. Validating inputs...");
    try {
        const custId = document.getElementById('redeemCustomerIndex').value;
        const pointsQtyVal = document.getElementById('redeemPointsQty').value;
        const pointsQty = parseInt(pointsQtyVal);
        const reason = document.getElementById('redeemNotes').value.trim() || 'Manual Point Redemption';

        const cust = state.customers.find(c => c.id === custId);
        if (!cust) {
            showToast('Customer account not found.', 'danger');
            return;
        }

        if (isNaN(pointsQty) || pointsQty <= 0) {
            showToast('Please enter a valid points quantity to redeem.', 'warning');
            return;
        }

        if (pointsQty > cust.pointsCurrent) {
            showToast('Redemption amount exceeds available points balance.', 'warning');
            return;
        }

        // Deduct points
        cust.pointsCurrent -= pointsQty;
        cust.pointsRedeemed += pointsQty;

        // Log in redemption history
        if (!cust.redeemedHistory) cust.redeemedHistory = [];
        cust.redeemedHistory.push({
            points: pointsQty,
            reason,
            date: new Date().toISOString()
        });

        console.log("Updating customer points deduction in database:", cust);
        await saveCustomer(cust);
        await logActivity(`Redeemed ${pointsQty} loyalty points for ${cust.name} (Reason: ${reason})`);
        
        console.log("Loyalty points redemption database write successful. Refreshing UI profile...");
        showToast(`Successfully redeemed -${pointsQty} points! Updated balance: ${cust.pointsCurrent} pts`, 'success');
        closeModal('redeemPointsModal');

        renderCustomerProfile(custId);
    } catch (err) {
        console.error("Critical error in redeem points form submit:", err);
        showToast("Failed to process loyalty points database record.", "danger");
    }
}

// --- DYNAMIC IMAGE RESIZING CANVAS WORKER ---
function setupImageUploadHandling(zoneId, fileInputId, promptIconId, promptTextId, previewId) {
    const zone = document.getElementById(zoneId);
    const input = document.getElementById(fileInputId);
    if (!zone || !input) return;

    safeBind(zone, 'click', () => input.click());

    safeBind(zone, 'dragover', (e) => {
        e.preventDefault();
        zone.style.borderColor = 'var(--primary)';
        zone.style.backgroundColor = 'var(--primary-light)';
    });

    safeBind(zone, 'dragleave', () => {
        zone.style.borderColor = 'var(--border-color)';
        zone.style.backgroundColor = 'var(--slate-50)';
    });

    safeBind(zone, 'drop', (e) => {
        e.preventDefault();
        zone.style.borderColor = 'var(--border-color)';
        zone.style.backgroundColor = 'var(--slate-50)';
        
        if (e.dataTransfer.files.length > 0) {
            compressAndDisplayImage(e.dataTransfer.files[0], promptIconId, promptTextId, previewId);
        }
    });

    safeBind(input, 'change', function() {
        if (this.files.length > 0) {
            compressAndDisplayImage(this.files[0], promptIconId, promptTextId, previewId);
        }
    });
}

function compressAndDisplayImage(file, promptIconId, promptTextId, previewId) {
    if (!file.type.startsWith('image/')) {
        showToast('Invalid file format. Please attach an image scan.', 'warning');
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            const maxDimension = 600; 
            let width = img.width;
            let height = img.height;

            if (width > height) {
                if (width > maxDimension) {
                    height = Math.round((height * maxDimension) / width);
                    width = maxDimension;
                }
            } else {
                if (height > maxDimension) {
                    width = Math.round((width * maxDimension) / height);
                    height = maxDimension;
                }
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            const compressedBase64 = canvas.toDataURL('image/jpeg', 0.6);
            
            const preview = document.getElementById(previewId);
            preview.src = compressedBase64;
            preview.style.display = 'block';

            document.getElementById(promptIconId).style.display = 'none';
            document.getElementById(promptTextId).style.display = 'none';
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function resetImageUploadPreview(promptIconId, promptTextId, previewId) {
    document.getElementById(promptIconId).style.display = 'flex';
    document.getElementById(promptTextId).style.display = 'block';
    
    const preview = document.getElementById(previewId);
    preview.src = '';
    preview.style.display = 'none';
}

// --- DEDICATED PRESCRIPTION IMAGE UPLOAD ROUTINES ---
function setupPrescriptionImageUpload() {
    const zone = document.getElementById('rxUploadZone');
    const input = document.getElementById('rxImageFile');
    const previewContainer = document.getElementById('rxImagePreviewContainer');
    if (!zone || !input || !previewContainer) return;

    safeBind(zone, 'click', (e) => {
        if (e.target.closest('.thumbnail-preview-item') || e.target.closest('.thumbnail-delete-btn')) {
            return;
        }
        input.click();
    });

    safeBind(zone, 'dragover', (e) => {
        e.preventDefault();
        zone.style.borderColor = 'var(--primary)';
        zone.style.backgroundColor = 'var(--primary-light)';
    });

    safeBind(zone, 'dragleave', () => {
        zone.style.borderColor = 'var(--border-color)';
        zone.style.backgroundColor = 'var(--slate-50)';
    });

    safeBind(zone, 'drop', (e) => {
        e.preventDefault();
        zone.style.borderColor = 'var(--border-color)';
        zone.style.backgroundColor = 'var(--slate-50)';
        
        if (e.dataTransfer.files.length > 0) {
            handlePrescriptionFiles(e.dataTransfer.files);
        }
    });

    safeBind(input, 'change', function() {
        if (this.files.length > 0) {
            handlePrescriptionFiles(this.files);
        }
    });
}

function handlePrescriptionFiles(files) {
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file.type.startsWith('image/')) {
            showToast('Invalid file format. Please upload image files.', 'warning');
            continue;
        }
        if (currentPrescriptionImages.length >= 15) {
            showToast('Maximum of 15 images allowed per prescription record.', 'warning');
            break;
        }

        const reader = new FileReader();
        reader.onload = function(e) {
            const img = new Image();
            img.onload = function() {
                const canvas = document.createElement('canvas');
                const maxDimension = 600; 
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > maxDimension) {
                        height = Math.round((height * maxDimension) / width);
                        width = maxDimension;
                    }
                } else {
                    if (height > maxDimension) {
                        width = Math.round((width * maxDimension) / height);
                        height = maxDimension;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                const compressedBase64 = canvas.toDataURL('image/jpeg', 0.65);
                currentPrescriptionImages.push(compressedBase64);
                renderPrescriptionUploadThumbnails();
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }
}

function renderPrescriptionUploadThumbnails() {
    const container = document.getElementById('rxImagePreviewContainer');
    const promptIcon = document.getElementById('rxUploadPromptIcon');
    const promptText = document.getElementById('rxUploadPromptText');
    if (!container) return;

    container.innerHTML = '';
    if (currentPrescriptionImages.length === 0) {
        promptIcon.style.display = 'flex';
        promptText.style.display = 'block';
        return;
    }

    promptIcon.style.display = 'none';
    promptText.style.display = 'none';

    currentPrescriptionImages.forEach((imgSrc, index) => {
        const div = document.createElement('div');
        div.className = 'thumbnail-preview-item';
        div.innerHTML = `
            <img src="${imgSrc}" alt="Scan page ${index + 1}">
            <button type="button" class="thumbnail-delete-btn" data-index="${index}">&times;</button>
        `;
        
        safeBind(div.querySelector('img'), 'click', (e) => {
            e.stopPropagation();
            zoomImage(imgSrc);
        });

        safeBind(div.querySelector('.thumbnail-delete-btn'), 'click', (e) => {
            e.stopPropagation();
            currentPrescriptionImages.splice(index, 1);
            renderPrescriptionUploadThumbnails();
        });

        container.appendChild(div);
    });
}

function zoomImage(imgSrc) {
    const modal = document.getElementById('zoomImageModal');
    const img = document.getElementById('zoomedImage');
    if (modal && img) {
        img.src = imgSrc;
        openModal('zoomImageModal');
    }
}

// --- WHATSAPP REMINDER DISPATCH & TIMELINE INTEGRATION ---
async function triggerWhatsAppReminder(phone, medName, custId) {
    try {
        const message = `Namaste.\n\nYour regular medicines may be due for refill.\n\nPlease contact MediNest Pharmacy.\n\nThank you.`;
        const cleanPhone = phone.replace(/\D/g, ''); 
        const finalPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
        const waUrl = `https://wa.me/${finalPhone}?text=${encodeURIComponent(message)}`;
        
        window.open(waUrl, '_blank');

        const cust = state.customers.find(c => c.id === custId);
        if (cust) {
            if (!cust.whatsappReminders) cust.whatsappReminders = [];
            cust.whatsappReminders.push({
                date: new Date().toISOString(),
                medicineName: medName
            });
            await saveCustomer(cust);
            showToast(`WhatsApp reminder dispatched to customer. History logged.`, 'success');
            
            const activeModuleId = document.querySelector('.app-module.active').id;
            if (activeModuleId === 'customerProfileModule' && state.currentCustomerId === custId) {
                renderCustomerProfile(custId);
            }
        }
    } catch (err) {
        console.error('Error logging WhatsApp reminder:', err);
    }
}

// --- PORTABILITY & JSON DATA EXPORT / IMPORT ---
function setupPortabilitySettings() {
    // 1. Database Export
    safeBind('settingsExportDbBtn', 'click', () => {
        if (!state.currentUser || state.currentUser.role !== 'Admin') {
            showToast('Permission denied. Admin account required.', 'danger');
            return;
        }
        const backup = {
            customers: state.customers,
            prescriptions: state.prescriptions,
            purchases: state.purchases,
            reminders: state.reminders,
            users: state.users,
            settings: state.settings
        };
        
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backup));
        const dlAnchorElem = document.createElement('a');
        dlAnchorElem.setAttribute("href", dataStr);
        dlAnchorElem.setAttribute("download", `MediNest_Pharmacy_Database_Backup_${new Date().toISOString().split('T')[0]}.json`);
        dlAnchorElem.click();
        
        showToast('Database exported successfully! Keep this file safe.', 'success');
    });

    // 2. Database Import / Restore
    const importBtn = document.getElementById('settingsImportTriggerBtn');
    const fileSelector = document.getElementById('settingsImportFileSelector');

    if (importBtn && fileSelector) {
        safeBind(importBtn, 'click', () => {
            if (!state.currentUser || state.currentUser.role !== 'Admin') {
                showToast('Permission denied. Admin account required.', 'danger');
                return;
            }
            fileSelector.click();
        });
        safeBind(fileSelector, 'change', function() {
            if (!state.currentUser || state.currentUser.role !== 'Admin') {
                showToast('Permission denied. Admin account required.', 'danger');
                return;
            }
            if (this.files.length === 0) return;

            const reader = new FileReader();
            reader.onload = async function(e) {
                try {
                    const parsed = JSON.parse(e.target.result);
                    
                    if (parsed.customers && Array.isArray(parsed.customers)) {
                        state.customers = parsed.customers;
                        state.prescriptions = parsed.prescriptions || [];
                        state.purchases = parsed.purchases || [];
                        state.reminders = parsed.reminders || [];
                        
                        if (parsed.users && Array.isArray(parsed.users)) {
                            state.users = parsed.users;
                        }
                        if (parsed.settings) {
                            state.settings = parsed.settings;
                        }
                        
                        if (db) {
                            await dbClearAll();
                        }
                        await saveAllStateToDatabase();
                        showToast('Database restored successfully! Reloading views...', 'success');
                        
                        setTimeout(() => {
                            window.location.reload();
                        }, 1000);
                    } else {
                        showToast('Invalid backup file structure.', 'danger');
                    }
                } catch (err) {
                    showToast('Failed to parse database file. Check format.', 'danger');
                }
            };
            reader.readAsText(this.files[0]);
        });
    }

    // 3. Clear Database
    safeBind('settingsClearDbBtn', 'click', async () => {
        if (!state.currentUser || state.currentUser.role !== 'Admin') {
            showToast('Permission denied. Admin account required.', 'danger');
            return;
        }
        if (confirm('CRITICAL WARNING: This will completely wipe all customer files, prescriptions, and loyalty balances permanently. There is NO undo. Proceed?')) {
            safeStorage.clear();
            if (db) {
                try {
                    await dbClearAll();
                } catch (e) {
                    console.error('Error clearing IndexedDB:', e);
                }
            }
            
            // Re-initialize default users so we can still log in!
            const defaultUsers = [
                { id: 'user-admin', username: 'admin', password: 'admin123', role: 'Admin', name: 'System Admin', mobile: '9999999999' },
                { id: 'user-pharmacist', username: 'pharmacist', password: 'pharma123', role: 'Pharmacist', name: 'Default Pharmacist', mobile: '8888888888' }
            ];
            state.users = defaultUsers;
            state.settings = {
                storeName: 'MediNest Pharmacy',
                tagline: 'Care Beyond Medicines',
                rupeesPerPoint: 100,
                storeAddress: '',
                storeMobile: '',
                storeWhatsApp: '',
                logo: '',
                banner: ''
            };
            if (db) {
                await Promise.all(defaultUsers.map(u => dbPut(STORES.USERS, u)));
                await dbPut(STORES.SETTINGS, { id: 'app-settings', ...state.settings });
            }
            safeStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(defaultUsers));
            safeStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(state.settings));

            showToast('System database wiped. Default accounts restored.', 'danger');
            setTimeout(() => {
                window.location.reload();
            }, 1000);
        }
    });
}

// --- RENDER USERS IN SETTINGS PANEL ---
function renderUsersSettingsList() {
    const tbody = document.getElementById('usersSettingsTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    state.users.forEach(u => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${u.name}</strong></td>
            <td><code style="font-size:0.85rem;">${u.username}</code></td>
            <td><span class="item-badge ${u.role === 'Admin' ? 'badge-success' : 'badge-info'}">${u.role}</span></td>
            <td style="text-align:right;">
                ${u.id !== 'user-admin' && u.id !== 'user-pharmacist' && state.currentUser.role === 'Admin' ? `
                    <button type="button" class="btn btn-danger btn-sm delete-user-btn" data-id="${u.id}">Delete</button>
                ` : `<span style="color:var(--text-muted);font-size:0.8rem;">Protected</span>`}
            </td>
        `;
        tbody.appendChild(tr);
    });

    // Bind delete user triggers
    tbody.querySelectorAll('.delete-user-btn').forEach(btn => {
        safeBind(btn, 'click', (e) => {
            const id = e.target.getAttribute('data-id');
            const user = state.users.find(u => u.id === id);
            if (user && confirm(`Are you sure you want to delete the user account "${user.username}" (${user.name})?`)) {
                deleteUserAccount(id);
            }
        });
    });
}

async function deleteUserAccount(id) {
    if (!state.currentUser || state.currentUser.role !== 'Admin') {
        showToast('Permission denied. Admin account required.', 'danger');
        return;
    }
    state.users = state.users.filter(u => u.id !== id);
    try {
        safeStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(state.users));
        if (db) {
            await dbDelete(STORES.USERS, id);
        }
        showToast('User account deleted successfully.', 'success');
        renderUsersSettingsList();
    } catch (err) {
        console.error('Error deleting user:', err);
    }
}

// --- STAFF CREATION HANDLER ---
async function handleCreatePharmacistSubmit(e) {
    e.preventDefault();
    if (state.currentUser.role !== 'Admin') {
        showToast('Permission denied.', 'danger');
        return;
    }
    const name = document.getElementById('newUserName').value.trim();
    const mobile = document.getElementById('newUserMobile').value.trim();
    const username = document.getElementById('newUserUsername').value.trim().toLowerCase();
    const password = document.getElementById('newUserPassword').value;
    const role = document.getElementById('newUserRole').value;

    if (!name || !mobile || !username || !password || !role) {
        showToast('All fields are required to create a staff account.', 'warning');
        return;
    }

    if (!/^\d{10}$/.test(mobile)) {
        showToast('Please enter a valid 10-digit mobile number.', 'warning');
        return;
    }

    const usernameExists = state.users.find(u => u.username === username);
    if (usernameExists) {
        showToast(`Username "${username}" is already taken.`, 'danger');
        return;
    }

    const mobileExists = state.users.find(u => u.mobile === mobile);
    if (mobileExists) {
        showToast(`Mobile number ${mobile} is already registered to user "${mobileExists.name}".`, 'danger');
        return;
    }

    const newUser = {
        id: `user-${Date.now()}`,
        name,
        mobile,
        username,
        password,
        role
    };

    state.users.push(newUser);
    try {
        safeStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(state.users));
        if (db) {
            await dbPut(STORES.USERS, newUser);
        }
        showToast(`Staff account for "${name}" created successfully!`, 'success');
        document.getElementById('createPharmacistForm').reset();
        renderUsersSettingsList();
    } catch (err) {
        console.error('Error creating user account:', err);
        showToast('Failed to save staff account record.', 'danger');
    }
}

// --- BRANDING RULES HANDLER ---
async function handleBrandingSettingsSubmit(e) {
    e.preventDefault();
    if (state.currentUser.role !== 'Admin') {
        showToast('Permission denied.', 'danger');
        return;
    }
    const storeName = document.getElementById('setStoreName').value.trim();
    const tagline = document.getElementById('setTagline').value.trim();
    const rupeesPerPoint = parseInt(document.getElementById('setRupeesPerPoint').value) || 100;
    const storeAddress = document.getElementById('setStoreAddress').value.trim();
    const storeMobile = document.getElementById('setStoreMobile').value.trim();
    const storeWhatsApp = document.getElementById('setStoreWhatsApp').value.trim();

    const logoPreview = document.getElementById('logoPreview');
    const logo = (logoPreview && logoPreview.style.display !== 'none') ? logoPreview.src : '';
    const bannerPreview = document.getElementById('bannerPreview');
    const banner = (bannerPreview && bannerPreview.style.display !== 'none') ? bannerPreview.src : '';

    if (!storeName || !tagline || rupeesPerPoint < 10) {
        showToast('Please fill out all settings fields with valid values.', 'warning');
        return;
    }

    state.settings = { storeName, tagline, rupeesPerPoint, storeAddress, storeMobile, storeWhatsApp, logo, banner };
    
    try {
        safeStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(state.settings));
        if (db) {
            await dbPut(STORES.SETTINGS, { id: 'app-settings', ...state.settings });
        }
        showToast('Branding and loyalty rules saved successfully!', 'success');
        applyBrandingSettingsText();
    } catch (err) {
        console.error('Error saving settings settings:', err);
        showToast('Failed to save settings data.', 'danger');
    }
}

// --- LOGIN & SESSION HANDLERS ---
function showLoginMessage(message, isSuccess = false) {
    const errDiv = document.getElementById('loginErrorMessage');
    if (errDiv) {
        errDiv.textContent = message;
        errDiv.style.color = isSuccess ? 'var(--success)' : 'var(--danger)';
        errDiv.style.display = 'block';
    }
    // Also as toast notification
    showToast(message, isSuccess ? 'success' : 'danger');
}

async function handleLoginFormSubmit(e) {
    e.preventDefault();
    
    // Clear previous login messages
    const errDiv = document.getElementById('loginErrorMessage');
    if (errDiv) errDiv.style.display = 'none';

    const loginInputEl = document.getElementById('loginUsername');
    const passwordEl = document.getElementById('loginPassword');
    
    const loginInput = loginInputEl ? loginInputEl.value.trim().toLowerCase() : '';
    const password = passwordEl ? passwordEl.value : '';
    const role = document.getElementById('loginRole').value;

    // Check empty fields (cases 7 & 8)
    if (!loginInput) {
        showLoginMessage("Please enter username.", false);
        return;
    }
    if (!password) {
        showLoginMessage("Please enter password.", false);
        return;
    }

    // 1. Look up user by username or mobile (regardless of role first, to give specific errors)
    const user = state.users.find(u => u.username === loginInput || u.mobile === loginInput);
    
    const isMobileInput = /^\d{10}$/.test(loginInput);

    if (!user) {
        if (isMobileInput) {
            showLoginMessage("Mobile number is not registered.", false);
        } else {
            showLoginMessage("Username not found.", false);
        }
        return;
    }

    // 2. Check if role matches
    if (user.role !== role) {
    showLoginMessage("Incorrect role selected for this account.", false);
    return;
    }
}
*/
    }

    // 3. Check if account is locked
    const isLocked = user.lockedUntil && Date.now() < user.lockedUntil && (user.failedAttempts || 0) >= 5;
    if (isLocked) {
        showLoginMessage("Account temporarily locked due to multiple failed login attempts.", false);
        return;
    }

    // 4. Check if account is disabled
    if (user.status === 'Disabled') {
        showLoginMessage("Your account has been disabled. Contact Admin.", false);
        return;
    }

    // 5. Check if password is correct
    if (user.password === password) {
        // Reset lock & failed attempts
        user.failedAttempts = 0;
        user.lockedUntil = null;
        user.loginCount = (user.loginCount || 0) + 1;
        user.lastLoginAt = new Date().toISOString();

        // Save updated user stats to DB/state
        const userIndex = state.users.findIndex(u => u.id === user.id);
        if (userIndex >= 0) {
            state.users[userIndex] = user;
        }

        try {
            if (db) {
                await dbPut(STORES.USERS, user);
            }
            safeStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(state.users));
        } catch (err) {
            console.error('Error updating user login stats:', err);
        }

        // Set active session
        state.currentUser = user;
        safeStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(user));
        
        document.body.classList.remove('not-logged-in');
        document.getElementById('loginScreen').style.display = 'none';
        
        showLoginMessage("Login successful.", true);
        applyUserPermissions();
        await logActivity('Logged in', user);
        renderDashboard();
    } else {
        // Incorrect password
        user.failedAttempts = (user.failedAttempts || 0) + 1;
        
        // If failed attempts reach 5, lock account for 5 minutes
        if (user.failedAttempts >= 5) {
            user.lockedUntil = Date.now() + 5 * 60 * 1000;
        }

        // Save updated user stats to DB/state
        const userIndex = state.users.findIndex(u => u.id === user.id);
        if (userIndex >= 0) {
            state.users[userIndex] = user;
        }

        try {
            if (db) {
                await dbPut(STORES.USERS, user);
            }
            safeStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(state.users));
        } catch (err) {
            console.error('Error updating user failed attempts:', err);
        }

        if (user.failedAttempts >= 5) {
            showLoginMessage("Account temporarily locked due to multiple failed login attempts.", false);
        } else {
            if (isMobileInput) {
                showLoginMessage("Incorrect password. Please try again.", false);
            } else {
                showLoginMessage("Incorrect password.", false);
            }
        }
    }
}

async function handleRegisterSubmit(e) {
    e.preventDefault();
    console.log("Registration started");
    try {
        const nameInput = document.getElementById('registerName');
        const mobileInput = document.getElementById('registerMobile');
        const usernameInput = document.getElementById('registerUsername');
        const passwordInput = document.getElementById('registerPassword');
        const roleInput = document.getElementById('registerRole');

        if (!nameInput || !mobileInput || !usernameInput || !passwordInput || !roleInput) {
            const missing = [];
            if (!nameInput) missing.push('registerName');
            if (!mobileInput) missing.push('registerMobile');
            if (!usernameInput) missing.push('registerUsername');
            if (!passwordInput) missing.push('registerPassword');
            if (!roleInput) missing.push('registerRole');
            console.error("Registration failed - DOM elements missing:", missing);
            showToast(`Registration failed: HTML elements missing: ${missing.join(', ')}`, 'danger');
            return;
        }

        const name = nameInput.value.trim();
        const mobile = mobileInput.value.trim();
        const username = usernameInput.value.trim().toLowerCase();
        const password = passwordInput.value;
        const role = roleInput.value;

        console.log("Registration inputs retrieved:", { name, mobile, username, role });

        if (!name || !mobile || !username || !password || !role) {
            console.warn("Registration failed - missing required fields");
            showToast('Registration failed: All fields are required.', 'warning');
            return;
        }

        if (!/^\d{10}$/.test(mobile)) {
            console.warn("Registration failed - mobile number is not 10 digits:", mobile);
            showToast('Registration failed: Mobile number must be exactly 10 digits.', 'warning');
            return;
        }

        if (role === 'Admin') {
            console.warn("Registration failed - role Admin is restricted publicly");
            showToast('Registration failed: Creating Admin accounts is restricted to Admin settings.', 'danger');
            return;
        }

        const usersList = state.users || [];
        const usernameExists = usersList.find(u => u.username === username);
        if (usernameExists) {
            console.warn(`Registration failed - Username "${username}" already exists`);
            showToast(`Registration failed: Username "${username}" is already taken.`, 'danger');
            return;
        }

        const mobileExists = usersList.find(u => u.mobile === mobile);
        if (mobileExists) {
            console.warn(`Registration failed - Mobile number "${mobile}" already exists`);
            showToast(`Registration failed: Mobile number "${mobile}" is already registered.`, 'danger');
            return;
        }

        const newUser = {
            id: `user-${Date.now()}`,
            name,
            mobile,
            username,
            password,
            role,
            createdAt: new Date().toISOString(),
            lastLoginAt: '',
            loginCount: 0,
            status: 'Active'
        };

        console.log("Saving user to application state memory...");
        state.users.push(newUser);

        console.log("Saving user to safeStorage fallback...");
        safeStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(state.users));

        if (db) {
            console.log("Writing user record to IndexedDB database store...");
            try {
                await dbPut(STORES.USERS, newUser);
                console.log("IndexedDB write succeeded");
            } catch (dbErr) {
                console.error("IndexedDB write failed:", dbErr);
                throw new Error(`Database write failed: ${dbErr.message || dbErr}`);
            }
        } else {
            console.warn("IndexedDB connection not active, saved to local storage fallback only");
        }
        
        await logActivity(`Registered a new account: ${name} (Username: ${username}, Role: ${role})`, newUser);
        console.log("Registration completed");
        try {
            showToast('Account registered successfully! You can now sign in.', 'success');
        } catch (toastErr) {
            console.error("Notification failed during registration, but continuing anyway:", toastErr);
        }
        
        try {
            document.getElementById('registerForm').reset();
            // Return to login form
            document.getElementById('registerForm').style.display = 'none';
            document.getElementById('loginForm').style.display = 'flex';
        } catch (domErr) {
            console.error("DOM redirection after registration failed:", domErr);
        }
    } catch (err) {
        console.error('Registration failed:', err);
        try {
            showToast(`Registration failed: ${err.message || err}`, 'danger');
        } catch (toastErr) {
            console.error("Failed to show error toast:", toastErr);
        }
    }
}

function handleForgotPasswordSubmit(e) {
    e.preventDefault();
    const username = document.getElementById('forgotUsername').value.trim().toLowerCase();
    const role = document.getElementById('forgotRole').value;

    const user = state.users.find(u => u.username === username && u.role === role);
    if (user) {
        alert(`Account Verified!\n\nUser: ${user.name}\nPassword: ${user.password}\n\nPlease keep your credentials safe.`);
        document.getElementById('forgotPasswordForm').reset();
        document.getElementById('forgotPasswordForm').style.display = 'none';
        document.getElementById('loginForm').style.display = 'flex';
    } else {
        showToast('Account not found with specified username and role.', 'danger');
    }
}

async function handleChangePasswordSubmit(e) {
    e.preventDefault();
    const currentPassword = document.getElementById('changeCurrentPassword').value;
    const newPassword = document.getElementById('changeNewPassword').value;
    const confirmPassword = document.getElementById('changeConfirmPassword').value;

    if (!state.currentUser) {
        showToast('No user logged in.', 'danger');
        return;
    }

    if (currentPassword !== state.currentUser.password) {
        showToast('Current password does not match.', 'danger');
        return;
    }

    if (newPassword !== confirmPassword) {
        showToast('New passwords do not match.', 'warning');
        return;
    }

    if (newPassword.length < 4) {
        showToast('Password must be at least 4 characters long.', 'warning');
        return;
    }

    // Update in state
    state.currentUser.password = newPassword;
    const userIndex = state.users.findIndex(u => u.id === state.currentUser.id);
    if (userIndex >= 0) {
        state.users[userIndex].password = newPassword;
    }

    try {
        // Save to DB
        safeStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(state.users));
        safeStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(state.currentUser));
        if (db) {
            await dbPut(STORES.USERS, state.currentUser);
        }
        showToast('Password updated successfully!', 'success');
        document.getElementById('changePasswordForm').reset();
        closeModal('changePasswordModal');
    } catch (err) {
        console.error('Password change failed:', err);
        showToast('Failed to save updated password.', 'danger');
    }
}

async function handleLogout() {
    if (confirm('Are you sure you want to log out of MediNest Pharmacy?')) {
        await logActivity('Logged out');
        state.currentUser = null;
        safeStorage.setItem(STORAGE_KEYS.CURRENT_USER, '');
        
        // Reset login form
        document.getElementById('loginForm').reset();
        
        // Show login Screen
        document.body.classList.add('not-logged-in');
        document.getElementById('loginScreen').style.display = 'flex';
        showToast('Logged out of system session.', 'info');
    }
}

// --- UTILITY TIMELINE BUILDERS ---
function bindProfileTriggers() {
    document.querySelectorAll('.clickable-profile-trigger').forEach(trigger => {
        safeBind(trigger, 'click', (e) => {
            e.preventDefault();
            const custId = e.currentTarget.getAttribute('data-id');
            renderCustomerProfile(custId);
        });
    });
}

function getInitials(name) {
    if (!name) return '';
    const parts = name.split(' ');
    if (parts.length >= 2 && parts[0] && parts[1]) return (parts[0][0] + parts[1][0]).toUpperCase();
    if (name.length >= 2) return name.substr(0, 2).toUpperCase();
    return name.toUpperCase();
}

function renderEmptyStateMarkup(title, text) {
    return `
        <div class="empty-state">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0a2 2 0 01-2 2H6a2 2 0 01-2-2m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-4M4 13h4m1.5-4.5h.01M12 9.5h.01M14.5 9.5h.01" />
            </svg>
            <h5>${title}</h5>
            <p>${text}</p>
        </div>
    `;
}

// --- MODAL TRIGGERS ---
function openModal(modalId) {
    const overlay = document.getElementById(modalId);
    if (overlay) {
        overlay.classList.add('active');
    }
}

function closeModal(modalId) {
    const overlay = document.getElementById(modalId);
    if (overlay) {
        overlay.classList.remove('active');
    }
}

function setupModalClosers() {
    document.querySelectorAll('[data-close]').forEach(btn => {
        safeBind(btn, 'click', function(e) {
            e.preventDefault();
            const target = this.getAttribute('data-close');
            closeModal(target);
        });
    });

    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        safeBind(overlay, 'click', function(e) {
            if (e.target === this) {
                closeModal(this.id);
            }
        });
    });
}

// --- INITIALIZE EVENT ASSIGNMENTS ---
function setupEvents() {
    safeBind('themeToggleBtn', 'click', toggleTheme);
    safeBind('logoutBtn', 'click', handleLogout);
    safeBind('sidebarLogoutBtn', 'click', handleLogout);

    setupGlobalSearch();
    setupDashboardSearch();

    // Modal open triggers
    safeBind('openAddCustomerModalBtn', 'click', () => openCustomerFormModal());
    safeBind('openUploadRxModalBtn', 'click', () => openPrescriptionUploadModal());
    safeBind('openAddPurchaseModalBtn', 'click', () => openAddPurchaseModal());
    safeBind('openAddReminderModalBtn', 'click', () => openRefillReminderModal());
    
    safeBind('dashCreateReminderBtn', 'click', () => openRefillReminderModal());

    // Profile detail buttons shortcuts
    safeBind('profileGoBackBtn', 'click', () => navigateToModule('customersModule'));
    safeBind('profileAddPurchaseBtn', 'click', () => openAddPurchaseModal(state.currentCustomerId));
    safeBind('profileUploadRxBtn', 'click', () => openPrescriptionUploadModal(state.currentCustomerId));
    safeBind('profileAddReminderBtn', 'click', () => openRefillReminderModal(state.currentCustomerId));
    safeBind('profileEditCustomerBtn', 'click', () => openCustomerFormModal(state.currentCustomerId));

    // Profile sub-tabs routing
    document.querySelectorAll('.profile-tab-btn').forEach(btn => {
        safeBind(btn, 'click', function() {
            document.querySelectorAll('.profile-tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.profile-tab-content').forEach(c => c.classList.remove('active'));
            
            this.classList.add('active');
            const targetTab = this.getAttribute('data-tab');
            
            const tabTimeline = document.getElementById('profileTabTimeline');
            const tabPrescriptions = document.getElementById('profileTabPrescriptions');
            const tabPurchases = document.getElementById('profileTabPurchases');
            const tabReminders = document.getElementById('profileTabReminders');

            if (targetTab === 'timeline' && tabTimeline) tabTimeline.classList.add('active');
            if (targetTab === 'prescriptions' && tabPrescriptions) tabPrescriptions.classList.add('active');
            if (targetTab === 'purchases' && tabPurchases) tabPurchases.classList.add('active');
            if (targetTab === 'reminders' && tabReminders) tabReminders.classList.add('active');
        });
    });

    // Form submit handlers
    safeBind('customerForm', 'submit', handleCustomerFormSubmit);
    safeBind('prescriptionForm', 'submit', handlePrescriptionSubmit);
    safeBind('purchaseForm', 'submit', handlePurchaseSubmit);
    safeBind('reminderForm', 'submit', handleReminderSubmit);
    safeBind('redeemPointsForm', 'submit', handleRedeemPointsSubmit);
    safeBind('loginForm', 'submit', handleLoginFormSubmit);
    safeBind('registerForm', 'submit', handleRegisterSubmit);
    safeBind('registerSubmitBtn', 'click', () => {
        console.log("Register button clicked");
    });
    safeBind('forgotPasswordForm', 'submit', handleForgotPasswordSubmit);
    safeBind('changePasswordForm', 'submit', handleChangePasswordSubmit);
    safeBind('createPharmacistForm', 'submit', handleCreatePharmacistSubmit);
    safeBind('brandingSettingsForm', 'submit', handleBrandingSettingsSubmit);

    // Admin reset password modal form and live search for logs
    safeBind('adminResetPasswordForm', 'submit', handleAdminResetPasswordSubmit);
    safeBind('monitorLogSearchInput', 'input', renderActivityLogsTable);

    // Toggle links for login overlay
    safeBind('showRegisterLink', 'click', (e) => {
        e.preventDefault();
        document.getElementById('loginForm').style.display = 'none';
        document.getElementById('forgotPasswordForm').style.display = 'none';
        document.getElementById('registerForm').style.display = 'flex';
    });

    safeBind('backToLoginFromRegister', 'click', (e) => {
        e.preventDefault();
        document.getElementById('registerForm').style.display = 'none';
        document.getElementById('forgotPasswordForm').style.display = 'none';
        document.getElementById('loginForm').style.display = 'flex';
    });

    safeBind('forgotPasswordLink', 'click', (e) => {
        e.preventDefault();
        document.getElementById('loginForm').style.display = 'none';
        document.getElementById('registerForm').style.display = 'none';
        document.getElementById('forgotPasswordForm').style.display = 'flex';
    });

    safeBind('backToLoginFromForgot', 'click', (e) => {
        e.preventDefault();
        document.getElementById('forgotPasswordForm').style.display = 'none';
        document.getElementById('registerForm').style.display = 'none';
        document.getElementById('loginForm').style.display = 'flex';
    });

    // Change Password dialog binding
    safeBind('changePasswordBtn', 'click', () => {
        openModal('changePasswordModal');
    });

    // Recovery Report dialog bindings
    safeBind('viewRecoveryReportBtn', 'click', () => {
        openModal('recoveryReportModal');
    });
    safeBind('loginShowRecoveryReportBtn', 'click', (e) => {
        e.preventDefault();
        openModal('recoveryReportModal');
    });

    // Customer page search auto-refresh filter binding
    safeBind('customerSearchInput', 'input', () => {
        renderCustomersList();
    });

    // Live Loyalty point preview indicator inside Purchase Modal
    const purBillAmount = document.getElementById('purBillAmount');
    if (purBillAmount) {
        safeBind(purBillAmount, 'input', function() {
            const amt = parseFloat(this.value) || 0;
            const rupeesRule = state.settings.rupeesPerPoint || 100;
            const pts = Math.floor(amt / rupeesRule);
            const preview = document.getElementById('purPointsPreview');
            if (preview) preview.textContent = `${pts} pts`;
        });
    }

    // Days Supply date calculation listeners inside Reminders Modal
    const remDaysSupply = document.getElementById('remDaysSupply');
    if (remDaysSupply) {
        safeBind(remDaysSupply, 'input', function() {
            const days = parseInt(this.value) || 0;
            if (days > 0) {
                const expectedDate = new Date();
                expectedDate.setDate(expectedDate.getDate() + days);
                document.getElementById('remExpectedDate').value = expectedDate.toISOString().split('T')[0];

                const reminderDate = new Date();
                reminderDate.setDate(reminderDate.getDate() + days - 3); 
                document.getElementById('remDate').value = reminderDate.toISOString().split('T')[0];
            } else {
                document.getElementById('remExpectedDate').value = '';
                document.getElementById('remDate').value = '';
            }
        });
    }

    // Profile page direct redemption button logic
    const profilePointsBalance = document.getElementById('profilePointsBalance');
    if (profilePointsBalance && profilePointsBalance.parentElement) {
        safeBind(profilePointsBalance.parentElement, 'click', () => {
            openRedeemPointsModal(state.currentCustomerId);
        });
    }

    safeBind('profileLoyaltyPointsMetricCard', 'click', () => {
        openRedeemPointsModal(state.currentCustomerId);
    });

    // Image upload helpers
    setupPrescriptionImageUpload();
    setupImageUploadHandling('purUploadZone', 'purImageFile', 'purUploadPromptIcon', 'purUploadPromptText', 'purImagePreview');

    // PDF compilation download binding
    safeBind('viewRxDownloadPdfBtn', 'click', downloadRxPdf);

    // Delegate WhatsApp Reminder button clicks
    safeBind(document, 'click', (e) => {
        const btn = e.target.closest('.send-whatsapp-reminder-btn');
        if (btn) {
            e.preventDefault();
            const phone = btn.getAttribute('data-phone');
            const medName = btn.getAttribute('data-med');
            const custId = btn.getAttribute('data-cust-id');
            triggerWhatsAppReminder(phone, medName, custId);
        }
    });

    // Setup branding upload listeners
    const logoFileInput = document.getElementById('setLogoFile');
    if (logoFileInput) {
        safeBind(logoFileInput, 'change', function() {
            if (this.files && this.files[0]) {
                const reader = new FileReader();
                reader.onload = function(e) {
                    const preview = document.getElementById('logoPreview');
                    if (preview) {
                        preview.src = e.target.result;
                        preview.style.display = 'block';
                    }
                };
                reader.readAsDataURL(this.files[0]);
            }
        });
    }

    const bannerFileInput = document.getElementById('setBannerFile');
    if (bannerFileInput) {
        safeBind(bannerFileInput, 'change', function() {
            if (this.files && this.files[0]) {
                const reader = new FileReader();
                reader.onload = function(e) {
                    const preview = document.getElementById('bannerPreview');
                    if (preview) {
                        preview.src = e.target.result;
                        preview.style.display = 'block';
                    }
                };
                reader.readAsDataURL(this.files[0]);
            }
        });
    }

    // Database settings
    setupPortabilitySettings();
    setupModalClosers();
}

// --- ADMIN MONITORING SYSTEM FUNCTIONS ---
async function logActivity(action, userOverride = null) {
    const user = userOverride || state.currentUser;
    const name = user ? user.name : 'Unknown User';
    const role = user ? user.role : 'System';
    
    const logEntry = {
        id: `log-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        name,
        role,
        action,
        timestamp: new Date().toISOString()
    };
    
    if (!state.logs) state.logs = [];
    state.logs.push(logEntry);
    
    try {
        safeStorage.setItem(STORAGE_KEYS.LOGS, JSON.stringify(state.logs));
        if (db) {
            await dbPut(STORES.LOGS, logEntry);
        }
    } catch (err) {
        console.error('Error saving activity log:', err);
    }
}

function renderMonitoringDashboard() {
    if (!state.currentUser || state.currentUser.role !== 'Admin') return;

    // 1. Stats
    const totalUsers = state.users.length;
    const admins = state.users.filter(u => u.role === 'Admin').length;
    const pharmacists = state.users.filter(u => u.role === 'Pharmacist').length;

    document.getElementById('monitorTotalUsers').textContent = totalUsers;
    document.getElementById('monitorTotalAdmins').textContent = admins;
    document.getElementById('monitorTotalPharmacists').textContent = pharmacists;

    // 2. User Table
    const userTbody = document.getElementById('monitorUsersTableBody');
    if (userTbody) {
        userTbody.innerHTML = '';
        state.users.forEach(u => {
            const tr = document.createElement('tr');
            
            const regDateStr = u.createdAt ? new Date(u.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A';
            const lastLoginStr = u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Never';
            
            const statusClass = u.status === 'Disabled' ? 'badge-danger' : 'badge-success';
            const statusText = u.status || 'Active';
            
            const isSelf = state.currentUser.id === u.id;
            const isProtectedDefault = u.id === 'user-admin' || u.id === 'user-pharmacist';

            tr.innerHTML = `
                <td>
                    <div style="font-weight:600;">${u.name}</div>
                    <div style="font-size:0.8rem;color:var(--text-muted);">@${u.username}</div>
                </td>
                <td style="font-family:monospace;">${u.mobile || 'N/A'}</td>
                <td><span class="item-badge ${u.role === 'Admin' ? 'badge-success' : 'badge-info'}">${u.role}</span></td>
                <td>${regDateStr}</td>
                <td>${lastLoginStr}</td>
                <td>${u.loginCount || 0}</td>
                <td><span class="item-badge badge-success">Active</span></td>
                <td style="text-align:right;">
                    <div style="display:flex;gap:6px;justify-content:flex-end;">
                        <button type="button" class="btn btn-primary btn-sm reset-user-password-btn" data-id="${u.id}" data-username="${u.username}">Reset PW</button>
                        ${!isSelf && !isProtectedDefault ? `
                            <button type="button" class="btn btn-danger btn-sm delete-user-monitor-btn" data-id="${u.id}">Delete</button>
                        ` : ''}
                    </div>
                </td>
            `;
            userTbody.appendChild(tr);
        });

        // Bind reset password
        userTbody.querySelectorAll('.reset-user-password-btn').forEach(btn => {
            safeBind(btn, 'click', (e) => {
                const id = e.currentTarget.getAttribute('data-id');
                const username = e.currentTarget.getAttribute('data-username');
                openAdminResetPasswordModal(id, username);
            });
        });

        // Bind delete user
        userTbody.querySelectorAll('.delete-user-monitor-btn').forEach(btn => {
            safeBind(btn, 'click', async (e) => {
                const id = e.currentTarget.getAttribute('data-id');
                const user = state.users.find(u => u.id === id);
                if (user && confirm(`Are you absolutely sure you want to delete the user account "${user.username}" (${user.name})?`)) {
                    await deleteUserAccountMonitor(id);
                }
            });
        });
    }

    // 3. Activity Logs Table
    renderActivityLogsTable();
}

async function toggleUserStatus(id, newStatus) {
    // No-op as status column does not exist on remote database
    console.log(`toggleUserStatus no-op called for ${id} with status ${newStatus}`);
}


function openAdminResetPasswordModal(id, username) {
    document.getElementById('resetPasswordUserId').value = id;
    document.getElementById('resetPasswordUsername').value = username;
    document.getElementById('resetPasswordNewValue').value = '';
    openModal('adminResetPasswordModal');
}

async function handleAdminResetPasswordSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('resetPasswordUserId').value;
    const newValue = document.getElementById('resetPasswordNewValue').value;
    
    if (!newValue || newValue.length < 4) {
        showToast('Password must be at least 4 characters long.', 'warning');
        return;
    }
    
    const user = state.users.find(u => u.id === id);
    if (!user) {
        showToast('User not found.', 'danger');
        return;
    }
    
    user.password = newValue;
    const userIndex = state.users.findIndex(u => u.id === id);
    if (userIndex >= 0) {
        state.users[userIndex] = user;
    }
    
    try {
        safeStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(state.users));
        if (db) {
            await dbPut(STORES.USERS, user);
        }
        
        if (state.currentUser && state.currentUser.id === id) {
            state.currentUser.password = newValue;
            safeStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(state.currentUser));
        }
        
        showToast(`Password for "${user.username}" reset successfully!`, 'success');
        await logActivity(`Admin reset password for user ${user.name} (Username: ${user.username})`);
        closeModal('adminResetPasswordModal');
        renderMonitoringDashboard();
    } catch (err) {
        console.error('Error resetting user password:', err);
        showToast('Failed to reset user password.', 'danger');
    }
}

async function deleteUserAccountMonitor(id) {
    const user = state.users.find(u => u.id === id);
    if (!user) return;
    
    state.users = state.users.filter(u => u.id !== id);
    try {
        safeStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(state.users));
        if (db) {
            await dbDelete(STORES.USERS, id);
        }
        showToast('User account deleted successfully.', 'success');
        await logActivity(`Admin deleted user account for ${user.name} (Username: ${user.username})`);
        renderMonitoringDashboard();
    } catch (err) {
        console.error('Error deleting user:', err);
    }
}

function renderActivityLogsTable() {
    const tbody = document.getElementById('monitorActivityLogTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    const filterInput = document.getElementById('monitorLogSearchInput');
    const filterVal = filterInput ? filterInput.value.toLowerCase().trim() : '';
    
    const logs = state.logs || [];
    const filtered = logs.filter(l => {
        return (
            (l.name && l.name.toLowerCase().includes(filterVal)) ||
            (l.role && l.role.toLowerCase().includes(filterVal)) ||
            (l.action && l.action.toLowerCase().includes(filterVal))
        );
    });
    
    filtered.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:16px;color:var(--text-muted);">No activity logs matching filter.</td></tr>`;
        return;
    }
    
    filtered.forEach(l => {
        const tr = document.createElement('tr');
        const timeStr = l.timestamp ? new Date(l.timestamp).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'N/A';
        tr.innerHTML = `
            <td><strong>${l.name || 'Unknown User'}</strong></td>
            <td><span class="item-badge ${l.role === 'Admin' ? 'badge-success' : 'badge-info'}">${l.role || 'System'}</span></td>
            <td>${l.action}</td>
            <td style="font-family:monospace;font-size:0.85rem;">${timeStr}</td>
        `;
        tbody.appendChild(tr);
    });
}

// --- AUTOMATED TESTING HARNESS FOR REGISTRATION FLOW ---
async function runAutomatedRegistrationTest() {
    console.log("=== STARTING AUTOMATED REGISTRATION FLOW TEST ===");
    showToast("Starting automated registration flow test...", "info");
    
    // Create/get a DOM container for the test output
    let testOutput = document.getElementById('test-output');
    if (!testOutput) {
        testOutput = document.createElement('div');
        testOutput.id = 'test-output';
        testOutput.style.position = 'fixed';
        testOutput.style.bottom = '10px';
        testOutput.style.right = '10px';
        testOutput.style.width = '350px';
        testOutput.style.maxHeight = '200px';
        testOutput.style.overflowY = 'auto';
        testOutput.style.backgroundColor = 'rgba(0, 0, 0, 0.85)';
        testOutput.style.color = '#fff';
        testOutput.style.padding = '10px';
        testOutput.style.borderRadius = '5px';
        testOutput.style.zIndex = '10000';
        testOutput.style.fontFamily = 'monospace';
        testOutput.style.fontSize = '11px';
        document.body.appendChild(testOutput);
    }
    testOutput.innerHTML = '<h4>Test Log:</h4>';
    
    const logToDOM = (msg, isError = false) => {
        const p = document.createElement('p');
        p.style.margin = '2px 0';
        p.style.color = isError ? '#ff6b6b' : '#51cf66';
        p.textContent = msg;
        testOutput.appendChild(p);
        testOutput.scrollTop = testOutput.scrollHeight;
        
        // Post logs to server stdout
        const status = isError ? 'error' : 'info';
        fetch(`/log-test?status=${status}&msg=${encodeURIComponent(msg)}`).catch(() => {});
    };

    logToDOM("Starting automated test...");
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
    
    try {
        const testUsername = "autotest_pharmacist";
        const testMobile = "5555512345";
        
        // Clean up user if already exists from prior test runs
        state.users = state.users.filter(u => u.username !== testUsername && u.mobile !== testMobile);
        safeStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(state.users));
        if (db) {
            const allUsers = await dbGetAll(STORES.USERS);
            const toDelete = allUsers.find(u => u.username === testUsername);
            if (toDelete) {
                await dbDelete(STORES.USERS, toDelete.id);
            }
        }
        
        // Go to registration screen
        const showRegisterBtn = document.getElementById('showRegisterLink');
        if (showRegisterBtn) {
            showRegisterBtn.click();
        }
        await sleep(500);

        // Fill out registration form
        document.getElementById('registerName').value = "Auto Test Pharmacist";
        document.getElementById('registerMobile').value = testMobile;
        document.getElementById('registerUsername').value = testUsername;
        document.getElementById('registerPassword').value = "testpass123";
        document.getElementById('registerRole').value = "Pharmacist";

        // Submit form
        console.log("Submitting registration form...");
        logToDOM("Submitting registration form...");
        const registerForm = document.getElementById('registerForm');
        
        const submitEvent = new Event('submit', { cancelable: true });
        registerForm.dispatchEvent(submitEvent);
        
        await sleep(1200); // Wait for async IndexedDB writes

        // Verify registration
        const savedUser = state.users.find(u => u.username === testUsername);
        if (!savedUser) {
            throw new Error("Registration Failed: User not found in state memory after form submission.");
        }
        console.log("User successfully saved in memory state:", savedUser);
        logToDOM("User successfully saved in memory state.");
        
        if (db) {
            const dbUsers = await dbGetAll(STORES.USERS);
            const dbUser = dbUsers.find(u => u.username === testUsername);
            if (!dbUser) {
                throw new Error("Registration Failed: User not persisted in IndexedDB.");
            }
            console.log("User successfully persisted in IndexedDB:", dbUser);
            logToDOM("User successfully persisted in IndexedDB.");
        }

        showToast("Registration verification succeeded!", "success");
        await sleep(1000);

        // Fill out login form
        console.log("Attempting login with the new test user...");
        logToDOM("Attempting login with new user...");
        document.getElementById('loginUsername').value = testUsername;
        document.getElementById('loginPassword').value = "testpass123";
        document.getElementById('loginRole').value = "Pharmacist";

        // Submit login
        const loginForm = document.getElementById('loginForm');
        const loginSubmitEvent = new Event('submit', { cancelable: true });
        loginForm.dispatchEvent(loginSubmitEvent);

        await sleep(1000);

        // Verify session and role assignment
        if (!state.currentUser) {
            throw new Error("Login Failed: state.currentUser is null after login form submit.");
        }
        if (state.currentUser.username !== testUsername) {
            throw new Error(`Login Failed: currentUser is ${state.currentUser.username}, expected ${testUsername}`);
        }
        if (state.currentUser.role !== "Pharmacist") {
            throw new Error(`Role Assignment Failed: Assigned role is ${state.currentUser.role}, expected Pharmacist`);
        }

        console.log("Login and session verified. Current User:", state.currentUser);
        logToDOM("Login and session verified.");
        console.log("Verify Role-Based restrictions: Settings module should be hidden for Pharmacist");
        const settingsNavItem = document.querySelector('.nav-link[data-target="settingsModule"]');
        if (settingsNavItem) {
            const parent = settingsNavItem.closest('.nav-item');
            if (parent && parent.style.display !== 'none') {
                throw new Error("Role-Based Restriction Failed: Admin settings nav link is visible to Pharmacist user.");
            }
        }
        console.log("Role-Based restrictions verified successfully.");
        logToDOM("Role restrictions verified.");

        // --- NEW STEP: TEST CUSTOMER SAVING ---
        console.log("Testing customer saving functionality...");
        logToDOM("Testing customer saving...");
        const testCustName = "Auto Test Customer";
        const testCustMobile = "0000000000";

        // Clean up test customer if exists
        state.customers = state.customers.filter(c => c.mobile !== testCustMobile);
        safeStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(state.customers));
        if (db) {
            const allCusts = await dbGetAll(STORES.CUSTOMERS);
            const toDelete = allCusts.find(c => c.mobile === testCustMobile);
            if (toDelete) {
                await dbDelete(STORES.CUSTOMERS, toDelete.id);
            }
        }

        // Open add customer form modal
        openCustomerFormModal();
        await sleep(500);

        // Fill customer form
        document.getElementById('custName').value = testCustName;
        document.getElementById('custMobile').value = testCustMobile;
        document.getElementById('custAge').value = "35";
        document.getElementById('custGender').value = "Male";
        document.getElementById('custFamilyId').value = "";
        document.getElementById('custAddress').value = "123 Auto Test Drive";

        // Submit customer form
        const customerForm = document.getElementById('customerForm');
        const custSubmitEvent = new Event('submit', { cancelable: true });
        customerForm.dispatchEvent(custSubmitEvent);

        await sleep(1200); // Wait for async database save

        // Verify customer saved in state memory
        const savedCust = state.customers.find(c => c.mobile === testCustMobile);
        if (!savedCust) {
            throw new Error("Customer Save Failed: Customer not found in state memory.");
        }
        console.log("Customer successfully saved in state memory:", savedCust);
        logToDOM("Customer saved in state memory.");

        // Verify customer persisted in IndexedDB
        if (db) {
            const dbCusts = await dbGetAll(STORES.CUSTOMERS);
            const dbCust = dbCusts.find(c => c.mobile === testCustMobile);
            if (!dbCust) {
                throw new Error("Customer Save Failed: Customer not persisted in IndexedDB.");
            }
            console.log("Customer successfully persisted in IndexedDB:", dbCust);
            logToDOM("Customer persisted in database.");
        }

        showToast("Customer saving verification succeeded!", "success");
        await sleep(1000);

        // --- NEW STEP: TEST PRESCRIPTION SAVING ---
        console.log("Testing prescription compiling and saving...");
        logToDOM("Testing prescription saving...");
        
        // Open upload Rx modal with the customer ID
        openPrescriptionUploadModal(savedCust.id);
        await sleep(500);
        
        // Fill out prescription fields
        document.getElementById('rxDoctor').value = "Dr. Auto Test";
        document.getElementById('rxNotes').value = "Auto Test Prescription Notes";
        document.getElementById('rxDate').value = new Date().toISOString().split('T')[0];
        
        // Push a dummy 1x1 white pixel base64 GIF to the upload queue
        currentPrescriptionImages = ["data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"];
        
        // Submit prescription form
        const prescriptionForm = document.getElementById('prescriptionForm');
        const rxSubmitEvent = new Event('submit', { cancelable: true });
        prescriptionForm.dispatchEvent(rxSubmitEvent);
        
        await sleep(1200); // Wait for PDF generation and database save
        
        // Verify prescription saved in state memory
        const savedRx = state.prescriptions.find(r => r.customerId === savedCust.id);
        if (!savedRx) {
            throw new Error("Prescription Save Failed: Record not found in state memory.");
        }
        console.log("Prescription successfully saved in memory:", savedRx);
        logToDOM("Prescription saved in memory.");
        
        // Verify prescription persisted in IndexedDB
        if (db) {
            const dbRxs = await dbGetAll(STORES.PRESCRIPTIONS);
            const dbRx = dbRxs.find(r => r.customerId === savedCust.id);
            if (!dbRx) {
                throw new Error("Prescription Save Failed: Record not persisted in IndexedDB.");
            }
            console.log("Prescription successfully persisted in IndexedDB:", dbRx);
            logToDOM("Prescription persisted in database.");
        }
        
        showToast("Prescription saving verification succeeded!", "success");
        await sleep(1000);

        // Clean up test customer, test prescription, and test user directly to leave environment pristine
        console.log("Cleaning up automated test entities...");
        logToDOM("Cleaning up test entities...");
        
        if (db) {
            // Delete prescription from DB
            const allRxs = await dbGetAll(STORES.PRESCRIPTIONS);
            const rxsToDelete = allRxs.filter(r => r.customerId === savedCust.id);
            for (const rx of rxsToDelete) {
                await dbDelete(STORES.PRESCRIPTIONS, rx.id);
            }
        }
        state.prescriptions = state.prescriptions.filter(r => r.customerId !== savedCust.id);
        safeStorage.setItem(STORAGE_KEYS.PRESCRIPTIONS, JSON.stringify(state.prescriptions));

        state.customers = state.customers.filter(c => c.mobile !== testCustMobile);
        safeStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(state.customers));
        if (db) {
            const allCusts = await dbGetAll(STORES.CUSTOMERS);
            const toDeleteCust = allCusts.find(c => c.mobile === testCustMobile);
            if (toDeleteCust) {
                await dbDelete(STORES.CUSTOMERS, toDeleteCust.id);
            }
        }

        state.users = state.users.filter(u => u.username !== testUsername);
        safeStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(state.users));
        if (db) {
            await dbDelete(STORES.USERS, savedUser.id);
        }

        console.log("=== ALL AUTOMATED REGISTRATION, LOGIN, AND CUSTOMER SAVING TESTS PASSED SUCCESSFULLY ===");
        showToast("All registration, login, and customer saving tests passed successfully!", "success");
        logToDOM("ALL TESTS PASSED SUCCESSFULLY!");
        testOutput.setAttribute('data-status', 'passed');
    } catch (testErr) {
        console.error("=== AUTOMATED TEST FAILED ===", testErr);
        showToast(`Test Failed: ${testErr.message}`, "danger");
        logToDOM(`TEST FAILED: ${testErr.message}`, true);
        testOutput.setAttribute('data-status', 'failed');
    }
}

// Start application thread on complete window rendering (handles deferred/asynchronous script cases)
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}// force vercel redeploy

