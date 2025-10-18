let cart = [];
        let products = [
            { id: 1, name: "Nasi Putih", price: 5000, modalPrice: 3000, barcode: "001", stock: 50, minStock: 10 },
            { id: 2, name: "Ayam Goreng", price: 15000, modalPrice: 10000, barcode: "002", stock: 25, minStock: 5 },
            { id: 3, name: "Teh Manis", price: 3000, modalPrice: 1500, barcode: "003", stock: 100, minStock: 20 },
            { id: 4, name: "Kerupuk", price: 2000, modalPrice: 1200, barcode: "004", stock: 30, minStock: 10 },
            { id: 5, name: "Sambal", price: 1000, modalPrice: 500, barcode: "005", stock: 15, minStock: 5 }
        ];
        let salesData = [];
        let debtData = [];
        let thermalPrinter = null;
        let printerConnected = false;

// ---------------------------------------------------------------------------
// Receipt preview state
//
// After processing a transaction we no longer print a receipt immediately.
// Instead, we display a preview in a modal with options to print or skip.
// The pendingReceiptTransaction stores the transaction data awaiting printing,
// and pendingFinalizeCallback holds a function that will finalize the
// transaction (clear cart, update UI, etc.) once the user closes the preview.
let pendingReceiptTransaction = null;
let pendingFinalizeCallback = null;

/**
 * Show the receipt preview modal for a given transaction.
 * The modal displays the formatted receipt and offers "Cetak" or "Keluar".
 * @param {Object} transaction The transaction object to preview.
 */
function showReceiptPreview(transaction) {
    pendingReceiptTransaction = transaction;
    const previewModal = document.getElementById('receiptPreviewModal');
    const contentEl = document.getElementById('receiptPreviewContent');
    if (contentEl) {
        contentEl.innerHTML = generateReceiptContent(transaction);
    }
    if (previewModal) {
        previewModal.classList.remove('hidden');
    }
}
// Expose globally for inline button handlers if needed
window.showReceiptPreview = showReceiptPreview;

/**
 * Close the receipt preview without printing.
 * After closing, if a finalize callback is pending it will be invoked.
 */
function closeReceiptPreview() {
    const previewModal = document.getElementById('receiptPreviewModal');
    if (previewModal) {
        previewModal.classList.add('hidden');
    }
    // Run finalize callback if defined
    if (typeof pendingFinalizeCallback === 'function') {
        const cb = pendingFinalizeCallback;
        pendingFinalizeCallback = null;
        pendingReceiptTransaction = null;
        cb(false);
    } else {
        pendingReceiptTransaction = null;
    }
}
window.closeReceiptPreview = closeReceiptPreview;

/**
 * Print the receipt from preview.  This will call printThermalReceipt() and
 * then invoke the pending finalization callback.
 */
function printReceiptFromPreview() {
    const previewModal = document.getElementById('receiptPreviewModal');
    if (pendingReceiptTransaction) {
        printThermalReceipt(pendingReceiptTransaction);
    }
    if (previewModal) {
        previewModal.classList.add('hidden');
    }
    // Run finalize callback if defined
    if (typeof pendingFinalizeCallback === 'function') {
        const cb = pendingFinalizeCallback;
        pendingFinalizeCallback = null;
        pendingReceiptTransaction = null;
        cb(true);
    } else {
        pendingReceiptTransaction = null;
    }
}
window.printReceiptFromPreview = printReceiptFromPreview;

// Loading overlay helpers
// These functions control the display of a full‑screen loading indicator which
// appears during long‑running operations such as importing or exporting data.
function showLoading(message) {
    const overlay = document.getElementById('loadingOverlay');
    if (!overlay) return;
    overlay.classList.remove('hidden');
    const messageEl = overlay.querySelector('.loading-message');
    if (messageEl) {
        messageEl.textContent = message || 'Memproses...';
    }
}
function hideLoading() {
    const overlay = document.getElementById('loadingOverlay');
    if (!overlay) return;
    overlay.classList.add('hidden');
}
// Expose these helpers globally in case they need to be called from inline attributes
window.showLoading = showLoading;
window.hideLoading = hideLoading;

//
// Audio feedback: play a short beep when a barcode is successfully scanned.
// Some mobile browsers block audio playback unless it originates from a user
// interaction.  Since the scan is triggered by a button click, the beep
// should play without issue.  The beep uses the Web Audio API to avoid
// external audio file dependencies.
function playBeep() {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        oscillator.connect(gain);
        gain.connect(ctx.destination);
        oscillator.type = 'sine';
        oscillator.frequency.value = 880; // frequency in Hz (A5 note)
        oscillator.start();
        // ramp down the volume quickly to avoid click noise
        gain.gain.setValueAtTime(1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
        oscillator.stop(ctx.currentTime + 0.15);
    } catch (err) {
        console.warn('Unable to play beep:', err);
    }
}
// Expose beep so it can be used from other functions or inline handlers if needed
window.playBeep = playBeep;

// -----------------------------------------------------------------------------
// Confirmation overlay helpers
//
// The browser's native confirm() function blocks script execution and
// displays a modal dialog that cannot be styled consistently across
// platforms.  To provide a smoother experience, we implement a custom
// confirmation overlay.  The helper below shows an in‑page modal with
// customizable text and invokes a callback with the user's choice.
//
// Usage:
//   showConfirmLayer('Apakah Anda yakin?', function(result) {
//       if (result) {
//           // user clicked "Ya"
//       } else {
//           // user clicked "Batal"
//       }
//   });
//
function showConfirmLayer(message, callback) {
    const overlay = document.getElementById('confirmOverlay');
    const messageEl = document.getElementById('confirmMessage');
    const yesBtn = document.getElementById('confirmYesButton');
    const noBtn = document.getElementById('confirmNoButton');
    // Fallback to native confirm if elements are missing
    if (!overlay || !messageEl || !yesBtn || !noBtn) {
        const result = window.confirm(message);
        if (typeof callback === 'function') callback(result);
        return;
    }
    // Insert message and show overlay
    messageEl.textContent = message;
    overlay.classList.remove('hidden');
    // Define click handlers
    function cleanup() {
        yesBtn.removeEventListener('click', onYes);
        noBtn.removeEventListener('click', onNo);
    }
    function onYes() {
        cleanup();
        overlay.classList.add('hidden');
        if (typeof callback === 'function') callback(true);
    }
    function onNo() {
        cleanup();
        overlay.classList.add('hidden');
        if (typeof callback === 'function') callback(false);
    }
    // Attach listeners
    yesBtn.addEventListener('click', onYes);
    noBtn.addEventListener('click', onNo);
}
// Expose to global scope so it can be used in inline onclick handlers if needed
window.showConfirmLayer = showConfirmLayer;

// -----------------------------------------------------------------------------
// Alert overlay helper
//
// This helper replaces the built‑in alert() function with a non‑blocking
// overlay.  The overlay displays a message and a single "OK" button.  When
// the button is clicked, the overlay disappears.  Scripts that call
// alert() normally will continue executing without waiting for the user to
// acknowledge the message, which is acceptable for informational alerts.
function showAlertLayer(message, callback) {
    const overlay = document.getElementById('alertOverlay');
    const messageEl = document.getElementById('alertMessage');
    const okBtn = document.getElementById('alertOkButton');
    if (!overlay || !messageEl || !okBtn) {
        // If elements are missing, fall back to native alert (stored below)
        if (typeof _nativeAlert === 'function') {
            _nativeAlert(message);
        }
        if (typeof callback === 'function') callback();
        return;
    }
    messageEl.textContent = message;
    overlay.classList.remove('hidden');
    function handler() {
        okBtn.removeEventListener('click', handler);
        overlay.classList.add('hidden');
        if (typeof callback === 'function') callback();
    }
    okBtn.addEventListener('click', handler);
}
// Expose globally so other functions or inline handlers can call it directly
window.showAlertLayer = showAlertLayer;
// Capture a reference to the browser's native alert() implementation before
// overriding it.  This allows showAlertLayer() to fall back to the native
// dialog if the overlay elements are not yet present in the DOM (e.g. during
// early script execution) without causing infinite recursion.
const _nativeAlert = window.alert.bind(window);

// Override the native alert() function to use our overlay.  This will
// intercept calls to alert() throughout the application and display the
// message in our styled overlay.  Since this implementation does not block
// script execution, any subsequent code will run immediately after the
// overlay is shown.  If blocking behavior is required, refactor the
// specific callsite to use showAlertLayer() with a callback instead.
window.alert = function(message) {
    showAlertLayer(String(message));
};

// -----------------------------------------------------------------------------
// Barcode scan result post‑processing helpers
//
// When scanning 1D codes using Quagga or html5‑qrcode, it is common to see
// occasional misreads (incorrect digits) due to motion blur, lighting, or
// partial frames.  To mitigate this, we employ a small buffer that collects
// successive scan results and only accepts a code when the same value has been
// seen multiple times in a row.  For EAN‑13 barcodes, which include a
// check‑digit, we further validate the code using the check‑digit algorithm.

// Buffer of the last few scanned codes.  When the same code appears multiple
// times, it is accepted and the buffer is cleared.  This reduces false
// positives from transient misreads.
const _scanBuffer = [];

/**
 * Compute and verify the check‑digit for an EAN‑13 code.  The last digit of an
 * EAN‑13 barcode is a checksum calculated from the preceding 12 digits.  This
 * function returns true if the checksum is valid.  If the code contains any
 * non‑digits or does not have 13 characters, it returns false.
 *
 * @param {string} code A 13‑digit numeric string representing the EAN‑13 code.
 * @returns {boolean} True if the checksum is valid, false otherwise.
 */
function validateEAN13(code) {
    if (!/^[0-9]{13}$/.test(code)) {
        return false;
    }
    // Convert string to array of integers
    const digits = code.split('').map(d => parseInt(d, 10));
    // Compute sum of digits multiplied by weights: 1 for even positions, 3 for odd positions
    let sum = 0;
    for (let i = 0; i < 12; i++) {
        // Even index (0-based) uses weight 1; odd uses weight 3
        const weight = (i % 2 === 0) ? 1 : 3;
        sum += digits[i] * weight;
    }
    const computedCheck = (10 - (sum % 10)) % 10;
    return computedCheck === digits[12];
}

/**
 * Process a scanned code by buffering and validating it before taking action.
 *
 * This helper aims to improve accuracy by waiting for the same code to be
 * detected multiple times in succession before passing it to the core handler.
 * For EAN‑13 codes, it verifies the checksum.  Codes that do not pass
 * validation or fail to repeat are ignored.
 *
 * @param {string} rawCode The raw barcode string returned by the scanner.
 */
function processScannedCode(rawCode) {
    if (!rawCode) return;
    // Remove whitespace and newline characters
    const code = rawCode.trim();
    // Validate EAN‑13 checksum if applicable
    if (/^[0-9]{13}$/.test(code) && !validateEAN13(code)) {
        // Invalid checksum: likely a misread; ignore it
        return;
    }
    // Add code to the buffer and keep only the last 5 entries
    _scanBuffer.push(code);
    if (_scanBuffer.length > 5) {
        _scanBuffer.shift();
    }
    // Count how many times this code appears in the buffer
    const occurrences = _scanBuffer.filter(c => c === code).length;
    // If we have seen this code at least twice, accept it
    if (occurrences >= 2) {
        // Clear the buffer to avoid duplicate triggers
        _scanBuffer.length = 0;
        // Delegate to the standard handler
        handleDecodedBarcode(code);
    }
}

// URL of your deployed Google Apps Script Web App
// IMPORTANT: Replace the value below with the Web App URL obtained
// from deploying the Apps Script in Google Sheets.
// Example: "https://script.google.com/macros/s/AKfycb1234567890/exec"
// Inserted by request: Use the actual Web App URL provided by the user for Google Apps Script integration
// Placeholder to disable auto-import in offline test environment during testing
// URL for Google Apps Script integration.  This value is used for
// importing and exporting data to Google Sheets.  It was copied from
// the original version of the project to preserve the existing
// synchronization functionality.  If you deploy a new Apps Script,
// update this URL accordingly.
const GOOGLE_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycby0sIYymZUVJsCDli6jpehKEImLN40hG8h4j6NDK3XrYLtJhqL1lNP6hQ6YHBXobJ8/exec';


        // Global state for products tab view mode
        // Default to grid layout. Values can be 'grid', 'table' or 'list'
// Load initial data from a server-side database when running via Node.js.
// On static hosts like GitHub Pages, there is no `/api/database` endpoint,
// so this function returns immediately to avoid network errors.
async function loadDatabase() {
    // Detect if the application is served from a static host (e.g., GitHub Pages)
    // by checking if the current origin matches localhost or a development port.
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (!isLocal) {
        // Skip loading from /api/database when not running on a local server.
        return;
    }
    try {
        const response = await fetch('/api/database');
        if (response.ok) {
            const data = await response.json();
            products = data.products ?? products;
            salesData = data.salesData ?? salesData;
            debtData = data.debtData ?? debtData;
        }
    } catch (error) {
        console.error('Failed to load database:', error);
    }
}

let productViewMode = 'grid';

// Index of the currently highlighted product suggestion when using keyboard navigation.
// A value of -1 means no suggestion is selected.  This is reset whenever
// suggestions are shown or hidden.  Arrow key presses will update this value
// and visually highlight the corresponding suggestion element.
let currentSuggestionIndex = -1;

// Flag controlling whether the global USB barcode scanner listener is active.
// The initial value is true so that scanning works by default.  Toggled via
// a button in the header.  When false, keystrokes are not interpreted as
// barcode scans and only the barcode input field handles scanning.
let globalScannerEnabled = true;

// -----------------------------------------------------------------------------
// Table sorting state
//
// When displaying products in table view, we allow the user to sort by
// clicking column headers (name, price, stock).  This section defines
// variables to keep track of the current list being displayed and the
// direction of sorting for each sortable column.  The sort state toggles
// between 'asc' and 'desc' each time a header is clicked.

// Holds the array of products currently rendered in the table.  It is
// initialised in displayProductsTable() so that sortTableBy() can sort the
// same list without re-fetching or re-filtering.  When a search filter is
// applied, this list is replaced with the filtered results.
let currentTableList = [];

// Stores the sort direction for each sortable column.  The value toggles
// between 'asc' and 'desc' when a header is clicked.  Default values set
// initial order (name ascending, price descending, stock descending).
const tableSortState = {
    name: 'asc',
    price: 'desc',
    stock: 'desc'
};

/**
 * Sort the current table list by the specified column.  Toggling the sort
 * direction each time a header is clicked.  After sorting, the table is
 * re-rendered via displayProductsTable().  Columns supported: 'name',
 * 'price', 'stock'.
 *
 * @param {string} column The column key to sort by.
 */
function sortTableBy(column) {
    if (!currentTableList || !Array.isArray(currentTableList)) {
        return;
    }
    // Toggle sort direction for the column
    if (tableSortState[column] === 'asc') {
        tableSortState[column] = 'desc';
    } else {
        tableSortState[column] = 'asc';
    }
    const direction = tableSortState[column];
    currentTableList.sort((a, b) => {
        let valA;
        let valB;
        if (column === 'name') {
            valA = (a.name || '').toString().toLowerCase();
            valB = (b.name || '').toString().toLowerCase();
            if (valA < valB) return direction === 'asc' ? -1 : 1;
            if (valA > valB) return direction === 'asc' ? 1 : -1;
            return 0;
        }
        if (column === 'price') {
            valA = a.price || 0;
            valB = b.price || 0;
        } else if (column === 'stock') {
            // Service products with unlimited stock are treated as 0 for sorting
            valA = (a.isService || a.price === 0) ? 0 : (a.stock || 0);
            valB = (b.isService || b.price === 0) ? 0 : (b.stock || 0);
        } else {
            return 0;
        }
        return direction === 'asc' ? valA - valB : valB - valA;
    });
    // Re-render the table with the sorted list
    displayProductsTable(currentTableList);
}

// -----------------------------------------------------------------------------
// Global USB barcode scanner handling
//
// Many USB barcode scanners emulate a keyboard by sending a rapid sequence
// of keystrokes that represent the barcode digits followed by an Enter key.
// This helper listens for keydown events at the document level, accumulates
// characters into a buffer, and when the Enter key is received within a
// short time window it treats the buffer as a scanned barcode.  This allows
// barcode scanning to work regardless of which input field currently has
// focus or which tab is active.  If the scanned code matches an existing
// product, it is immediately added to the cart.  Otherwise, a new product
// modal is shown with the barcode prefilled so the operator can quickly
// create a new item.

// Time (in milliseconds) allowed between the first and last keystroke of a
// barcode scan.  If the total duration exceeds this threshold the input
// sequence is considered manual typing rather than a barcode scan.
// Adjusted threshold: allow up to 1000ms between first and last keystroke
// to accommodate slower synthetic input sequences during testing or when the
// scanner introduces slight delays.  In production a lower value (e.g. 500ms)
// may be preferable.
const BARCODE_SCAN_DURATION_THRESHOLD = 1000;

/**
 * Initialize the global barcode scanner listener.  This attaches a keydown
 * handler to the document that collects keystrokes into a buffer and
 * dispatches the scanned barcode when the Enter key is pressed within the
 * configured time threshold.  Non‑alphanumeric keys reset the buffer.
 */
function initGlobalBarcodeScanner() {
    let scanBuffer = '';
    let scanStartTime = null;
    document.addEventListener('keydown', function(event) {
        // If the global scanner is disabled, do nothing.  This allows the
        // operator to type freely without triggering scan actions when the
        // standby mode is turned off via the toggle button.
        if (!globalScannerEnabled) {
            return;
        }
        // Do not treat keystrokes inside the primary barcode search input as a
        // hardware scan.  The barcode input has its own handler (handleBarcodeInput)
        // that performs lookup and cart actions appropriately.  Without this
        // check, typing a product name in the search field followed by Enter
        // would inadvertently trigger the global scanner logic and open the
        // "Tambah Produk" modal when the name does not match an exact barcode.
        const target = event.target;
        // Avoid treating keystrokes within any input or editable element as a scanner input.
        // This prevents manual quantity edits or text fields from triggering the global
        // barcode scan logic.  The barcode input has its own handlers via handleBarcodeInput().
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
            return;
        }
        // Ignore modifier keys and system shortcuts
        if (event.altKey || event.ctrlKey || event.metaKey) {
            return;
        }
        const key = event.key;
        const now = Date.now();
        // Reset the buffer if a long pause has occurred
        if (scanStartTime && now - scanStartTime > BARCODE_SCAN_DURATION_THRESHOLD) {
            scanBuffer = '';
            scanStartTime = null;
        }
        // When Enter is pressed, evaluate the buffer
        if (key === 'Enter') {
            if (scanBuffer.length > 0) {
                // If the sequence was entered quickly, treat it as a scan
                const duration = scanStartTime ? (now - scanStartTime) : 0;
                if (duration > 0 && duration <= BARCODE_SCAN_DURATION_THRESHOLD) {
                    const scannedCode = scanBuffer;
                    scanBuffer = '';
                    scanStartTime = null;
                    // Handle the scanned code globally
                    handleGlobalScannedBarcode(scannedCode);
                    // Prevent default behaviour to avoid triggering form submissions
                    event.preventDefault();
                    return;
                }
            }
            // Always reset the buffer when Enter is pressed
            scanBuffer = '';
            scanStartTime = null;
            return;
        }
        // Only accept single alphanumeric characters as part of the barcode
        if (key && key.length === 1 && /^[A-Za-z0-9]$/.test(key)) {
            if (!scanStartTime) {
                scanStartTime = now;
            }
            scanBuffer += key;
            return;
        }
        // Any other key resets the buffer
        scanBuffer = '';
        scanStartTime = null;
    });
}

// Keyboard shortcuts: Ctrl + Alt + Shift + '+' to increase quantity of the most recently added item,
// and Ctrl + Alt + Shift + '-' to decrease it. This avoids conflicting with browser zoom shortcuts.
document.addEventListener('keydown', function (e) {
    // Respond only when Ctrl, Alt and Shift are pressed, and Meta is not (Meta is the Command key on Mac).
    if (e.ctrlKey && e.altKey && e.shiftKey && !e.metaKey) {
        // Normalize key detection for plus (+) and minus (-) across keyboard layouts
        const key = e.key;
        if (key === '+' || key === '=' || key === 'Add') {
            // Increase quantity if cart has items
            if (cart && cart.length > 0) {
                const item = cart[0];
                updateQuantity(item.id, 1);
                e.preventDefault();
            }
        } else if (key === '-' || key === '_' || key === 'Subtract') {
            // Decrease quantity if cart has items
            if (cart && cart.length > 0) {
                const item = cart[0];
                updateQuantity(item.id, -1);
                e.preventDefault();
            }
        }
        // Shortcut handled; do not propagate further
        return;
    }
    // If the pressed keys do not match the shortcut, allow default behaviour.
});

/**
 * Process a globally scanned barcode.  If the barcode matches an existing
 * product, add it directly to the cart and play a beep.  If no match is
 * found, open the new product modal and prefill the barcode field so the
 * operator can quickly add the product to the catalog.
 *
 * @param {string} code The scanned barcode string.
 */
function handleGlobalScannedBarcode(code) {
    const trimmed = (code || '').trim();
    if (!trimmed) return;
    // Attempt to find the product by barcode
    const matchedProduct = products.find(p => p.barcode && p.barcode.toString() === trimmed);
    if (matchedProduct) {
        // Only add if stock is available
        if (matchedProduct.stock > 0) {
            addToCart({ id: matchedProduct.id, name: matchedProduct.name, price: matchedProduct.price, stock: matchedProduct.stock });
            playBeep();
        } else {
            alert(`Produk "${matchedProduct.name}" stok habis!`);
        }
    } else {
        // If no product matches, open the add product modal with barcode prefilled
        showAddProductModal();
        const barcodeInput = document.getElementById('newProductBarcode');
        if (barcodeInput) {
            barcodeInput.value = trimmed;
        }
        // Inform the operator that a new product needs to be added
        alert('Produk belum terdaftar. Silakan isi detail produk baru.');
    }
}

        // Initialize
document.addEventListener('DOMContentLoaded', async function() {
    await loadDatabase();
    loadData();
    generateSampleTransactions();
    updateTime();
    setInterval(updateTime, 1000);
    displaySavedProducts();
    displayScannerProductTable();
    // Ensure the view toggle buttons reflect the default view mode on load
    updateViewButtons();

    // Attach dynamic search events for barcode and product search inputs
    attachSearchListeners();

    // Secara otomatis mengimpor data dari Google Sheets pada saat halaman pertama kali dimuat.
    // Fungsi importDataFromGoogleSheets() akan menangani sendiri pengecekan URL dan menampilkan
    // peringatan jika konstanta GOOGLE_APPS_SCRIPT_URL belum diatur.
    try {
        await importDataFromGoogleSheets();
    } catch (err) {
        // Jika impor gagal, kesalahan dicetak ke konsol tetapi aplikasi tetap berjalan.
        console.error('Import otomatis gagal:', err);
    }

    // Inisialisasi opsi pemindai untuk perangkat mobile. Ini akan menampilkan
    // tombol untuk memulai dan menghentikan pemindaian kamera jika perangkat
    // yang digunakan terdeteksi sebagai ponsel atau tablet. Pada perangkat
    // desktop, opsi ini tetap disembunyikan.
    initializeMobileScanner();

    // Mulai pemindai barcode global untuk pemindai USB.  Ini memastikan aplikasi
    // selalu siap menerima input dari pemindai, baik ketika field scan aktif
    // maupun tidak, dan bahkan saat berada di tab selain tab pemindai.  Pastikan
    // fungsi initGlobalBarcodeScanner() telah terdefinisi sebelum panggilan ini.
    initGlobalBarcodeScanner();

    // Perbarui tampilan tombol toggle scan berdasarkan status awal.  Ini memastikan
    // pengguna melihat status ON/OFF yang benar setelah memuat halaman.
    updateScanToggleButton();

    /**
     * Global event delegation for search inputs.
     *
     * After the import process the DOM elements may be re-rendered, causing
     * previously attached listeners to be lost.  Rather than attaching
     * listeners directly to each input every time the DOM is updated, we
     * delegate the handling of input and keydown events to the document
     * level.  When an event bubbles up from an element with a specific
     * ID we run the appropriate handler.  This ensures that search and
     * suggestion functionality continue to work even after dynamic
     * updates to the DOM (e.g. import or view mode changes).
     */
    document.addEventListener('input', function (event) {
        const target = event.target;
        if (!target) return;
        // Barcode input: show product suggestions while typing
        if (target.id === 'barcodeInput') {
            const term = target.value.trim();
            // Only show suggestions when user is not pressing Enter; Enter is handled in keydown
            showProductSuggestions(term);
        }
        // Product search input: filter saved products in Produk tab
        if (target.id === 'productSearchInput') {
            const term = target.value.trim();
            searchProducts(term);
        }
    });

    document.addEventListener('keydown', function (event) {
        const target = event.target;
        if (!target) return;
        // If the keypress originated from the barcode input, only delegate
        // Enter key events.  Arrow keys and other keys are handled by the
        // element‑specific listener attached in attachSearchListeners().  Without
        // this guard, handleBarcodeInput would be called twice (both via this
        // delegation and the element listener), causing suggestion navigation
        // indexes to increment unexpectedly.
        if (target.id === 'barcodeInput' && event.key === 'Enter') {
            handleBarcodeInput(event);
        }
    });

    document.addEventListener('click', function(event) {
        const suggestionsContainer = document.getElementById('productSuggestions');
        const barcodeInput = document.getElementById('barcodeInput');
        
        if (!suggestionsContainer.contains(event.target) && event.target !== barcodeInput) {
            hideProductSuggestions();
        }
    });
});

/**
 * Attach search listeners to relevant inputs (barcode and product search).
 * This helper ensures that listeners are bound both on initial page load and after
 * dynamic updates such as data imports. Without reattaching, the inputs may
 * lose their event handlers when the DOM is rebuilt, causing search and
 * suggestion features to stop working.  Calling this multiple times is safe;
 * duplicate listeners will simply result in multiple event invocations.
 */
function attachSearchListeners() {
    // Barcode input: handle arrow navigation, Enter and suggestion filtering.
    // To avoid attaching duplicate listeners when the DOM is refreshed (e.g.
    // after importing data or re-rendering views), check a custom property on
    // the element before registering new handlers. Once a listener has been
    // attached, set the `_hasBarcodeListeners` flag to true so subsequent
    // calls to attachSearchListeners() will skip adding additional listeners.
    // This prevents the handleBarcodeInput function from being invoked
    // multiple times on each keydown event, which would otherwise cause
    // the highlighted suggestion index to increment unexpectedly.
    const barcodeInputEl = document.getElementById('barcodeInput');
    if (barcodeInputEl && !barcodeInputEl._hasBarcodeListeners) {
        // Attach keydown listener for arrow keys and Enter navigation
        barcodeInputEl.addEventListener('keydown', handleBarcodeInput);
        // Attach input listener to show suggestions as the user types
        barcodeInputEl.addEventListener('input', function(e) {
            const term = e.target.value.trim();
            showProductSuggestions(term);
        });
        // Mark that listeners have been attached to avoid duplicates
        barcodeInputEl._hasBarcodeListeners = true;
    }
    // Products tab search input: attach its listener only once
    const productSearchEl = document.getElementById('productSearchInput');
    if (productSearchEl && !productSearchEl._hasProductSearchListener) {
        productSearchEl.addEventListener('input', function(e) {
            searchProducts(e.target.value.trim());
        });
        productSearchEl._hasProductSearchListener = true;
    }
}

        // Tab switching
        function switchTab(tabName) {
            const tabContents = document.querySelectorAll('.tab-content');
            tabContents.forEach(content => content.classList.add('hidden'));

            const tabs = ['scannerTab', 'productsTab', 'historyTab', 'analysisTab'];
            tabs.forEach(tab => {
                const tabElement = document.getElementById(tab);
                tabElement.classList.remove('bg-green-500', 'text-white');
                tabElement.classList.add('text-gray-600', 'hover:text-green-600', 'hover:bg-green-50');
            });

            document.getElementById(tabName + 'Content').classList.remove('hidden');

            const activeTab = document.getElementById(tabName + 'Tab');
            activeTab.classList.add('bg-green-500', 'text-white');
            activeTab.classList.remove('text-gray-600', 'hover:text-green-600', 'hover:bg-green-50');

            if (tabName === 'analysis') {
                updateAnalysis();
            } else if (tabName === 'history') {
                // When switching to the history tab we need to respect any
                // previously selected filter or search term.  Previously the code
                // always called displayTransactionHistory(), which shows all
                // transactions regardless of the currently selected filter.  This
                // caused the filter dropdown to remain on "Hari Ini" (today) but the
                // list reverted to showing all transactions once the user switched
                // away from and back to the history tab.  To fix this we reapply
                // the appropriate filtering/searching logic on tab activation.
                const searchInput = document.getElementById('historySearchInput');
                if (searchInput && searchInput.value && searchInput.value.trim() !== '') {
                    // If a search term is present, perform search on current data
                    searchTransactionHistory(searchInput.value.trim());
                } else {
                    // Otherwise apply the selected filter (or "all" by default)
                    filterTransactionHistory();
                }
            }
        }

        // Load/Save data
        function loadData() {
            const savedProducts = localStorage.getItem('kasir_products');
    if (savedProducts) {
        products = JSON.parse(savedProducts);
        // Remove duplicate products loaded from local storage.  Duplicates can
        // accumulate over time if the same record is imported multiple times
        // from Google Sheets or added manually.  A duplicate is defined as
        // having the same name, price, modal price, barcode, wholesale rules
        // and service flag as another product.  Only the first occurrence is kept.
        removeDuplicateProducts();
    }
            
            const savedSales = localStorage.getItem('kasir_sales');
            if (savedSales) salesData = JSON.parse(savedSales);
            
            const savedDebt = localStorage.getItem('kasir_debt');
            if (savedDebt) debtData = JSON.parse(savedDebt);
        }

        function saveData() {
            localStorage.setItem('kasir_products', JSON.stringify(products));
            localStorage.setItem('kasir_sales', JSON.stringify(salesData));
            localStorage.setItem('kasir_debt', JSON.stringify(debtData));
        }

/**
 * Remove duplicate products from the global `products` array.  Two products are
 * considered duplicates if they share the same name, price, modal price,
 * barcode, wholesale minimum quantity, wholesale price and service flag.  Only
 * the first occurrence of each unique product is kept.  This helps prevent
 * clutter in the product list caused by importing the same data multiple
 * times or other bugs that inadvertently add identical entries.  After
 * deduplication, the `products` array is updated in place.
 */
function removeDuplicateProducts() {
    if (!Array.isArray(products) || products.length === 0) return;
    const seen = new Set();
    const deduped = [];
    for (const product of products) {
        const key = JSON.stringify([
            product.name ?? '',
            product.price ?? 0,
            product.modalPrice ?? 0,
            product.barcode ?? '',
            product.wholesaleMinQty ?? null,
            product.wholesalePrice ?? null,
            product.isService ?? false
        ]);
        if (!seen.has(key)) {
            seen.add(key);
            deduped.push(product);
        }
    }
    products.length = 0;
    products.push(...deduped);
}

        // Generate sample data
        function generateSampleTransactions() {
            if (salesData.length > 0) return;

            const sampleTransactions = [];
            const customerNames = ['Budi', 'Sari', 'Ahmad', 'Rina', 'Joko'];
            
            for (let dayOffset = 6; dayOffset >= 0; dayOffset--) {
                const date = new Date();
                date.setDate(date.getDate() - dayOffset);
                
                const transactionsPerDay = Math.floor(Math.random() * 7) + 2;
                
                for (let i = 0; i < transactionsPerDay; i++) {
                    const hour = Math.floor(Math.random() * 12) + 8;
                    const minute = Math.floor(Math.random() * 60);
                    date.setHours(hour, minute, 0, 0);
                    
                    const itemCount = Math.floor(Math.random() * 4) + 1;
                    const transactionItems = [];
                    
                    for (let j = 0; j < itemCount; j++) {
                        const randomProduct = products[Math.floor(Math.random() * products.length)];
                        const quantity = Math.floor(Math.random() * 3) + 1;
                        
                        const existingItem = transactionItems.find(item => item.id === randomProduct.id);
                        if (existingItem) {
                            existingItem.quantity += quantity;
                        } else {
                            transactionItems.push({
                                id: randomProduct.id,
                                name: randomProduct.name,
                                price: randomProduct.price,
                                quantity: quantity
                            });
                        }
                    }
                    
                    const subtotal = transactionItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
                    const discount = Math.random() < 0.3 ? Math.floor(Math.random() * 15) : 0;
                    const total = subtotal - (subtotal * discount / 100);
                    
                    const isPartialPayment = Math.random() < 0.1;
                    
                    if (isPartialPayment) {
                        const paid = Math.floor(total * (0.3 + Math.random() * 0.4));
                        const debt = total - paid;
                        const customerName = customerNames[Math.floor(Math.random() * customerNames.length)];
                        
                        const transaction = {
                            id: Date.now() + Math.random() * 1000,
                            items: transactionItems,
                            subtotal: subtotal,
                            discount: discount,
                            total: total,
                            paid: paid,
                            debt: debt,
                            customerName: customerName,
                            timestamp: date.toISOString(),
                            type: 'partial'
                        };
                        
                        sampleTransactions.push(transaction);
                        
                        const existingDebt = debtData.find(d => d.customerName === customerName);
                        if (existingDebt) {
                            existingDebt.amount += debt;
                            existingDebt.transactions.push({
                                id: transaction.id,
                                amount: debt,
                                date: date.toLocaleDateString('id-ID')
                            });
                        } else {
                            debtData.push({
                                customerName: customerName,
                                amount: debt,
                                transactions: [{
                                    id: transaction.id,
                                    amount: debt,
                                    date: date.toLocaleDateString('id-ID')
                                }]
                            });
                        }
                    } else {
                        const paid = total + Math.floor(Math.random() * 50000);
                        
                        const transaction = {
                            id: Date.now() + Math.random() * 1000,
                            items: transactionItems,
                            subtotal: subtotal,
                            discount: discount,
                            total: total,
                            paid: paid,
                            change: paid - total,
                            timestamp: date.toISOString(),
                            type: 'full'
                        };
                        
                        sampleTransactions.push(transaction);
                    }
                }
            }
            
            salesData.push(...sampleTransactions);
            saveData();
        }

        // Update time
        function updateTime() {
            const now = new Date();
            const timeString = now.toLocaleString('id-ID', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
            document.getElementById('currentTime').textContent = timeString;
        }

        // Format currency
        function formatCurrency(amount) {
            return new Intl.NumberFormat('id-ID', {
                style: 'currency',
                currency: 'IDR',
                minimumFractionDigits: 0
            }).format(amount);
        }

        // Barcode input handling
        function handleBarcodeInput(event) {
            // Always capture the current search term
            const searchTerm = event.target.value.trim();
            // Keyboard navigation: handle arrow keys to navigate suggestions
            const suggestionsContainer = document.getElementById('productSuggestions');
            const suggestions = suggestionsContainer ? suggestionsContainer.children : [];
            if (event.key === 'ArrowDown' && suggestions.length > 0) {
                // Move selection down; wrap to top when reaching the end
                event.preventDefault();
                if (currentSuggestionIndex < suggestions.length - 1) {
                    currentSuggestionIndex++;
                } else {
                    currentSuggestionIndex = 0;
                }
                highlightSuggestionAtIndex(currentSuggestionIndex);
                return;
            }
            if (event.key === 'ArrowUp' && suggestions.length > 0) {
                // Move selection up; wrap to bottom when reaching the start
                event.preventDefault();
                if (currentSuggestionIndex > 0) {
                    currentSuggestionIndex--;
                } else {
                    currentSuggestionIndex = suggestions.length - 1;
                }
                highlightSuggestionAtIndex(currentSuggestionIndex);
                return;
            }
            // If Enter is pressed and a suggestion is highlighted, select it
            if (event.key === 'Enter' && suggestions.length > 0 && currentSuggestionIndex >= 0) {
                event.preventDefault();
                const selectedEl = suggestions[currentSuggestionIndex];
                const productIdAttr = selectedEl ? selectedEl.getAttribute('data-product-id') : null;
                const productId = productIdAttr ? parseInt(productIdAttr, 10) : null;
                if (productId) {
                    selectProductFromSuggestion(productId);
                }
                currentSuggestionIndex = -1;
                hideProductSuggestions();
                // Clear input to prepare for next scan or search
                event.target.value = '';
                return;
            }
            if (event.key === 'Enter') {
                event.preventDefault();
                if (searchTerm) {
                    // First check for exact barcode match
                    const exactBarcodeMatch = products.find(p => p.barcode === searchTerm);
                    if (exactBarcodeMatch) {
                        if (exactBarcodeMatch.stock > 0) {
                            addToCart(exactBarcodeMatch);
                            event.target.value = '';
                            hideProductSuggestions();
                            return;
                        } else {
                            alert(`Produk "${exactBarcodeMatch.name}" stok habis!`);
                            return;
                        }
                    }
                    
                    // If no exact barcode match, check filtered products
                    const filteredProducts = products.filter(product => {
                        // Ensure name and barcode are strings to avoid TypeError when calling includes()
                        const name = (product.name || '').toString().toLowerCase();
                        const barcode = (product.barcode || '').toString();
                        return name.includes(searchTerm.toLowerCase()) || barcode.includes(searchTerm);
                    });
                    
                    // If only one product matches, add it to cart automatically
                    if (filteredProducts.length === 1) {
                        const product = filteredProducts[0];
                        if (product.stock > 0) {
                            addToCart(product);
                            event.target.value = '';
                            hideProductSuggestions();
                        } else {
                            alert(`Produk "${product.name}" stok habis!`);
                        }
                    } else if (filteredProducts.length === 0) {
                        alert('Produk tidak ditemukan!');
                    } else {
                        // Multiple matches found, keep showing suggestions
                        showProductSuggestions(searchTerm);
                    }
                }
            } else {
                // On every keystroke except Enter, show suggestions instantly
                showProductSuggestions(searchTerm);
            }
        }

        // Product suggestions
        function showProductSuggestions(searchTerm) {
            const suggestionsContainer = document.getElementById('productSuggestions');
            
            if (!searchTerm.trim()) {
                hideProductSuggestions();
                return;
            }

            let filteredProducts;
            try {
                filteredProducts = products.filter(product => {
                    const name = (product.name || '').toString().toLowerCase();
                    const barcode = (product.barcode || '').toString();
                    return name.includes(searchTerm.toLowerCase()) || barcode.includes(searchTerm);
                });
            } catch (err) {
                // Fallback: load products from localStorage if global products array is unavailable
                try {
                    const stored = localStorage.getItem('kasir_products');
                    const fallbackList = stored ? JSON.parse(stored) : [];
                    filteredProducts = fallbackList.filter(product => {
                        const name = (product.name || '').toString().toLowerCase();
                        const barcode = (product.barcode || '').toString();
                        return name.includes(searchTerm.toLowerCase()) || barcode.includes(searchTerm);
                    });
                } catch (_) {
                    filteredProducts = [];
                }
            }

            if (filteredProducts.length === 0) {
                hideProductSuggestions();
                return;
            }

            suggestionsContainer.innerHTML = filteredProducts.slice(0, 5).map(product => {
                const stockBadge = product.stock === 0 ? 
                    '<span class="text-xs bg-red-500 text-white px-2 py-1 rounded ml-2">HABIS</span>' :
                    product.stock <= product.minStock ?
                    '<span class="text-xs bg-yellow-500 text-white px-2 py-1 rounded ml-2">MENIPIS</span>' : '';
                
                return `
                    <div class="p-3 hover:bg-green-50 cursor-pointer border-b border-gray-100 last:border-b-0 ${product.stock === 0 ? 'opacity-50' : ''}"
                         data-product-id="${product.id}"
                         onclick="selectProductFromSuggestion(${product.id})">
                        <div class="flex justify-between items-center">
                            <div class="flex-1">
                                <div class="font-semibold text-gray-800 text-sm truncate">
                                    ${product.name}${stockBadge}
                                </div>
                                <div class="text-xs text-gray-600">
                                    ${product.barcode ? `Barcode: ${product.barcode}` : 'Tanpa barcode'} | Stok: ${product.stock}
                                </div>
                            </div>
                            <div class="text-right ml-2">
                                <div class="font-bold text-green-600 text-sm">${formatCurrency(product.price)}</div>
                                <div class="text-xs text-gray-500">${product.stock === 0 ? 'Stok habis' : 'Tap untuk tambah'}</div>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');

            // Reset highlighted suggestion index and clear previous highlights
            currentSuggestionIndex = -1;
            clearSuggestionHighlights();
            suggestionsContainer.classList.remove('hidden');
        }

    /**
     * Remove highlight from all suggestion items.  When the suggestion index changes
     * (via arrow keys) or when suggestions are refreshed, this function clears
     * any previously applied highlight class.  The highlight class used here
     * matches the hover colour (bg‑green‑100) defined in Tailwind CSS.
     */
    function clearSuggestionHighlights() {
        const container = document.getElementById('productSuggestions');
        if (!container) return;
        const items = container.children;
        for (let i = 0; i < items.length; i++) {
            items[i].classList.remove('bg-green-100');
        }
    }

    /**
     * Highlight the suggestion item at the given index.  Adds the
     * bg‑green‑100 class to the selected item and removes it from others.
     * If the index is out of range, no highlight is applied.  This helper
     * depends on clearSuggestionHighlights() being defined in the same scope.
     *
     * @param {number} index The zero‑based index of the suggestion to highlight.
     */
    function highlightSuggestionAtIndex(index) {
        const container = document.getElementById('productSuggestions');
        if (!container) return;
        const items = container.children;
        clearSuggestionHighlights();
        if (index >= 0 && index < items.length) {
            items[index].classList.add('bg-green-100');
        }
    }

        function hideProductSuggestions() {
            const container = document.getElementById('productSuggestions');
            if (container) {
                container.classList.add('hidden');
            }
            // Reset selection index and remove any highlights when hiding suggestions
            currentSuggestionIndex = -1;
            clearSuggestionHighlights();
        }

        function selectProductFromSuggestion(productId) {
            const product = products.find(p => p.id === productId);
            if (product && product.stock > 0) {
                addToCart(product);
                const barcodeInput = document.getElementById('barcodeInput');
                hideProductSuggestions();
                setTimeout(() => {
                    barcodeInput.value = '';
                    barcodeInput.focus();
                }, 300);
            }
        }

        // Cart functions
        function addToCart(product, quantity = 1) {
            // Check if it's a service product
            if (product.isService || product.price === 0) {
                showServiceProductModal(product);
                return;
            }

            if (product.stock < quantity) {
                alert(`Stok tidak mencukupi! Stok tersedia: ${product.stock}`);
                return;
            }

            const existingItem = cart.find(item => item.id === product.id);

            if (existingItem) {
                // If item already exists in the cart, update its quantity and
                // wholesale pricing then move it to the top of the cart array
                const newQuantity = existingItem.quantity + quantity;
                if (product.stock < newQuantity) {
                    alert(`Stok tidak mencukupi! Stok tersedia: ${product.stock}`);
                    return;
                }
                existingItem.quantity = newQuantity;
                // Update price based on wholesale pricing rules
                const fullProduct = products.find(p => p.id === product.id);
                if (fullProduct && fullProduct.wholesaleMinQty && fullProduct.wholesalePrice) {
                    if (existingItem.quantity >= fullProduct.wholesaleMinQty) {
                        existingItem.price = fullProduct.wholesalePrice;
                        existingItem.isWholesale = true;
                    } else {
                        existingItem.price = fullProduct.price;
                        existingItem.isWholesale = false;
                    }
                }
                // Move the updated item to the top of the cart to reflect recency
                const index = cart.indexOf(existingItem);
                if (index > 0) {
                    cart.splice(index, 1);
                    cart.unshift(existingItem);
                }
            } else {
                // New item: calculate wholesale pricing if applicable
                const fullProduct = products.find(p => p.id === product.id);
                let itemPrice = product.price;
                let isWholesale = false;
                if (fullProduct && fullProduct.wholesaleMinQty && fullProduct.wholesalePrice && quantity >= fullProduct.wholesaleMinQty) {
                    itemPrice = fullProduct.wholesalePrice;
                    isWholesale = true;
                }
                // Add new item to the beginning of the cart so it appears at the top of the list
                cart.unshift({
                    id: product.id,
                    name: product.name,
                    price: itemPrice,
                    quantity: quantity,
                    isWholesale: isWholesale,
                    // per-item discount fields (default no discount)
                    discountValue: 0,
                    discountType: 'percent'
                });
            }
            
            showAddToCartFeedback(product.name);
            updateCartDisplay();
            updateTotal();
        }

        function showAddToCartFeedback(productName) {
            const notification = document.createElement('div');
            notification.className = 'fixed top-20 right-4 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg z-50 bounce-in';
            notification.innerHTML = `
                <div class="flex items-center space-x-2">
                    <span>✅</span>
                    <span class="text-sm font-semibold">${productName} ditambahkan!</span>
                </div>
            `;
            
            document.body.appendChild(notification);
            
            setTimeout(() => {
                notification.style.opacity = '0';
                setTimeout(() => document.body.removeChild(notification), 300);
            }, 2000);
        }

        function toggleCart() {
            const floatingCart = document.getElementById('floatingCart');
            const cartToggle = document.getElementById('cartToggle');
            
            if (floatingCart.classList.contains('hidden')) {
                floatingCart.classList.remove('hidden');
                cartToggle.classList.add('hidden');
            } else {
                floatingCart.classList.add('hidden');
                cartToggle.classList.remove('hidden');
            }
        }

        // Service Product Modal Functions
        let currentServiceProduct = null;

        function showServiceProductModal(product) {
            currentServiceProduct = product;
            document.getElementById('serviceProductName').textContent = product.name;
            document.getElementById('serviceProductPrice').value = '';
            document.getElementById('serviceProductDescription').value = '';
            document.getElementById('serviceProductQuantity').value = '1';
            // reset modal price for services
            const modalInput = document.getElementById('serviceProductModalPrice');
            if (modalInput) {
                modalInput.value = '';
            }
            
            document.getElementById('serviceProductModal').classList.remove('hidden');
            document.getElementById('serviceProductModal').classList.add('flex');
            
            setTimeout(() => document.getElementById('serviceProductPrice').focus(), 100);
        }

        function closeServiceProductModal() {
            document.getElementById('serviceProductModal').classList.add('hidden');
            document.getElementById('serviceProductModal').classList.remove('flex');
            currentServiceProduct = null;
        }

        function handleServicePriceEnter(event) {
            if (event.key === 'Enter') {
                event.preventDefault();
                document.getElementById('serviceProductDescription').focus();
            }
        }

        function addServiceToCart() {
            if (!currentServiceProduct) {
                alert('Error: Produk jasa tidak ditemukan!');
                return;
            }

            const price = parseInt(document.getElementById('serviceProductPrice').value) || 0;
            const modalPrice = parseInt(document.getElementById('serviceProductModalPrice').value) || 0;
            const description = document.getElementById('serviceProductDescription').value.trim();
            const quantity = parseInt(document.getElementById('serviceProductQuantity').value) || 1;

            if (price <= 0) {
                alert('Harga jasa harus diisi dan lebih dari 0!');
                return;
            }

            if (quantity <= 0) {
                alert('Jumlah harus lebih dari 0!');
                return;
            }

            // Create service item with unique ID to allow multiple service entries
            const serviceItem = {
                id: Date.now() + Math.random(), // Unique ID for each service entry
                originalId: currentServiceProduct.id, // Keep reference to original product
                name: currentServiceProduct.name,
                price: price,
                quantity: quantity,
                isService: true,
                description: description || null,
                // store modalPrice if provided for profit calculations
                modalPrice: modalPrice > 0 ? modalPrice : undefined,
                // per-item discount fields for services (default no discount)
                discountValue: 0,
                discountType: 'percent'
            };

            cart.push(serviceItem);
            
            showAddToCartFeedback(`${currentServiceProduct.name} - ${formatCurrency(price)}`);
            updateCartDisplay();
            updateTotal();
            closeServiceProductModal();
        }

        function updateCartDisplay() {
            const cartItems = document.getElementById('cartItems');
            const cartItemCount = document.getElementById('cartItemCount');
            
            const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
            cartItemCount.textContent = totalItems;
            
            if (cart.length === 0) {
                cartItems.innerHTML = '<div class="text-center text-gray-500 py-8"><p class="text-sm">Keranjang masih kosong</p></div>';
                // Also update the scanner tab to show empty cart
                displayScannerProductTable();
                return;
            }

            cartItems.innerHTML = cart.map(item => {
                const isServiceItem = item.isService;
                const itemId = item.id;
                
                return `
                    <div class="bg-gray-50 p-2 rounded-lg fade-in ${isServiceItem ? 'border-l-4 border-purple-500' : ''}">
                        <div class="flex justify-between items-center">
                            <div class="flex-1">
                                <div class="font-semibold text-sm text-gray-800 truncate">
                                    ${item.name}
                                    ${isServiceItem ? '<span class="bg-purple-500 text-white px-1 rounded text-xs ml-1">🔧 JASA</span>' : ''}
                                </div>
                                <div class="text-xs text-gray-600">
                                    ${formatCurrency(item.price)} x ${item.quantity}
                                    ${item.isWholesale ? '<span class="bg-blue-500 text-white px-1 rounded text-xs ml-1">🏪 GROSIR</span>' : ''}
                                </div>
                                ${item.description ? `<div class="text-xs text-purple-600 italic mt-1">"${item.description}"</div>` : ''}
                                <!-- Per‑item discount controls: allow percentage or nominal discount per product -->
                                <div class="mt-1 flex items-center space-x-1 text-xs text-gray-600">
                                    <span>Diskon:</span>
                                    <input type="number" value="${item.discountValue || 0}" min="0"
                                           class="w-12 px-1 py-0 border rounded text-right text-xs"
                                           onchange="updateItemDiscount('${itemId}', this.value)"
                                           onclick="this.select()">
                                    <select class="px-1 py-0 border rounded text-xs"
                                            onchange="updateItemDiscountType('${itemId}', this.value)">
                                        <option value="percent" ${item.discountType === 'percent' ? 'selected' : ''}>%</option>
                                        <option value="amount" ${item.discountType === 'amount' ? 'selected' : ''}>Rp</option>
                                    </select>
                                </div>
                            </div>
                            <div class="flex items-center space-x-1 ml-2">
                                <div class="font-bold ${isServiceItem ? 'text-purple-600' : item.isWholesale ? 'text-blue-600' : 'text-green-600'} text-sm">${formatCurrency(item.price * item.quantity)}</div>
                                <div class="flex items-center space-x-1">
                                    ${isServiceItem ? `
                                        <button onclick="removeFromCart('${itemId}')" class="bg-red-500 hover:bg-red-600 text-white w-5 h-5 rounded text-xs">×</button>
                                    ` : `
                                        <button onclick="updateQuantity(${item.id}, -1)" class="bg-red-500 hover:bg-red-600 text-white w-5 h-5 rounded text-xs">-</button>
                                        <input type="number" value="${item.quantity}" min="1" max="999" 
                                               class="w-10 px-1 py-0 border rounded text-xs text-center" 
                                               onchange="setQuantity(${item.id}, this.value)"
                                               onkeypress="handleQuantityKeypress(event, ${item.id})"
                                               onclick="this.select()">
                                        <button onclick="updateQuantity(${item.id}, 1)" class="bg-green-500 hover:bg-green-600 text-white w-5 h-5 rounded text-xs">+</button>
                                        <button onclick="removeFromCart(${item.id})" class="bg-gray-500 hover:bg-gray-600 text-white w-5 h-5 rounded text-xs">×</button>
                                    `}
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');

            // Update scanner tab list to reflect current cart items
            displayScannerProductTable();
        }

        function updateQuantity(id, change) {
            const item = cart.find(item => item.id === id);
            if (item) {
                const newQuantity = item.quantity + change;
                if (newQuantity <= 0) {
                    removeFromCart(id);
                } else {
                    const product = products.find(p => p.id === id);
                    if (product && (product.isService || product.price === 0 || product.stock >= newQuantity)) {
                        item.quantity = newQuantity;
                        
                        // Update price based on wholesale pricing
                        if (product.wholesaleMinQty && product.wholesalePrice) {
                            if (item.quantity >= product.wholesaleMinQty) {
                                item.price = product.wholesalePrice;
                                item.isWholesale = true;
                            } else {
                                item.price = product.price;
                                item.isWholesale = false;
                            }
                        }
                        
                        updateCartDisplay();
                        updateTotal();
                    } else {
                        alert(`Stok tidak mencukupi! Stok tersedia: ${product.stock}`);
                    }
                }
            }
        }

        function setQuantity(id, newQuantity) {
            const quantity = parseInt(newQuantity) || 1;
            const item = cart.find(item => item.id === id);
            
            if (item) {
                if (quantity <= 0) {
                    removeFromCart(id);
                    return;
                }
                
                const product = products.find(p => p.id === id);
                if (product && (product.isService || product.price === 0 || product.stock >= quantity)) {
                    item.quantity = quantity;
                    
                    // Update price based on wholesale pricing
                    if (product.wholesaleMinQty && product.wholesalePrice) {
                        if (item.quantity >= product.wholesaleMinQty) {
                            item.price = product.wholesalePrice;
                            item.isWholesale = true;
                        } else {
                            item.price = product.price;
                            item.isWholesale = false;
                        }
                    }
                    
                    updateCartDisplay();
                    updateTotal();
                } else {
                    alert(`Stok tidak mencukupi! Stok tersedia: ${product.stock}`);
                    // Reset input to current quantity
                    updateCartDisplay();
                }
            }
        }

        function handleQuantityKeypress(event, id) {
            if (event.key === 'Enter') {
                event.preventDefault();
                event.target.blur(); // Remove focus to trigger onchange
            }
        }

        function removeFromCart(id) {
            // Handle both numeric IDs and string IDs (for service items)
            cart = cart.filter(item => item.id != id);
            updateCartDisplay();
            updateTotal();
        }

        function clearCart() {
            // Only prompt if there are items in the cart
            if (cart.length === 0) return;
            showConfirmLayer('Yakin ingin mengosongkan keranjang?', function(confirmed) {
                if (confirmed) {
                    cart = [];
                    updateCartDisplay();
                    updateTotal();
                }
            });
        }

        function updateTotal() {
            // First compute the intermediate total after per‑item discounts.  We also
            // accumulate the original subtotal (before item discounts) for potential
            // reporting purposes, but only the intermediate total is displayed as
            // the subtotal to the user.
            let intermediateTotal = 0;
            cart.forEach(item => {
                const itemSubtotal = item.price * item.quantity;
                let itemDiscount = 0;
                if (item.discountType === 'percent') {
                    itemDiscount = itemSubtotal * (item.discountValue || 0) / 100;
                } else {
                    itemDiscount = item.discountValue || 0;
                }
                if (itemDiscount > itemSubtotal) itemDiscount = itemSubtotal;
                intermediateTotal += (itemSubtotal - itemDiscount);
            });
            // Read global discount value and type from UI
            const discountInputEl = document.getElementById('discountInput');
            const discountTypeEl = document.getElementById('discountType');
            const globalValue = discountInputEl ? parseInt(discountInputEl.value) || 0 : 0;
            const globalType = discountTypeEl ? discountTypeEl.value : 'percent';
            // Calculate global discount amount based on type, applied on the intermediate total
            let globalAmount = 0;
            if (globalType === 'percent') {
                globalAmount = intermediateTotal * globalValue / 100;
            } else {
                globalAmount = globalValue;
            }
            if (globalAmount > intermediateTotal) {
                globalAmount = intermediateTotal;
            }
            const total = intermediateTotal - globalAmount;
            
            document.getElementById('subtotal').textContent = formatCurrency(intermediateTotal);
            document.getElementById('total').textContent = formatCurrency(total);

            // Perbarui notifikasi total bayar di daftar produk
            updateTotalPayNotice();
        }

    /**
     * Menampilkan atau menyembunyikan notifikasi total bayar pada tab Scanner.
     * Jika keranjang kosong maka elemen disembunyikan. Jika ada item,
     * total setelah diskon akan ditampilkan dalam format mata uang.
     */
    function updateTotalPayNotice() {
        const notice = document.getElementById('totalPayNotice');
        if (!notice) return;
        const amountSpan = document.getElementById('totalPayAmount');
        // Hitung subtotal setelah diskon per item dan total keseluruhan seperti di updateTotal()
        let intermediateTotal = 0;
        cart.forEach(item => {
            const itemSubtotal = item.price * item.quantity;
            let itemDiscount = 0;
            if (item.discountType === 'percent') {
                itemDiscount = itemSubtotal * (item.discountValue || 0) / 100;
            } else {
                itemDiscount = item.discountValue || 0;
            }
            if (itemDiscount > itemSubtotal) itemDiscount = itemSubtotal;
            intermediateTotal += (itemSubtotal - itemDiscount);
        });
        const discountInputEl = document.getElementById('discountInput');
        const discountTypeEl = document.getElementById('discountType');
        const globalValue = discountInputEl ? parseInt(discountInputEl.value) || 0 : 0;
        const globalType = discountTypeEl ? discountTypeEl.value : 'percent';
        let globalAmount = 0;
        if (globalType === 'percent') {
            globalAmount = intermediateTotal * globalValue / 100;
        } else {
            globalAmount = globalValue;
        }
        if (globalAmount > intermediateTotal) {
            globalAmount = intermediateTotal;
        }
        const total = intermediateTotal - globalAmount;
        if (cart.length === 0) {
            // Sembunyikan pemberitahuan bila keranjang kosong
            notice.classList.add('hidden');
        } else {
            // Tampilkan total bayar
            if (amountSpan) {
                amountSpan.textContent = formatCurrency(total);
            }
            notice.classList.remove('hidden');
        }
    }

        // Scanner product table functions
        function displayScannerProductTable() {
            const tableBody = document.getElementById('scannerProductTable');
            if (!tableBody) return;
            
            // Show cart items instead of product list in the scanner tab
            if (cart.length === 0) {
                tableBody.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-gray-500">Keranjang masih kosong</td></tr>';
                return;
            }

            tableBody.innerHTML = cart.map(item => {
                const isServiceItem = item.isService || item.price === 0;
                return `
                    <tr class="border-b border-gray-100 hover:bg-blue-50">
                        <td class="px-3 py-3">
                            <!-- Tampilkan nama produk dengan ukuran lebih besar agar seimbang dengan notifikasi Total Bayar -->
                            <div class="font-bold text-gray-800 text-lg">${item.name}${isServiceItem ? '<span class="bg-purple-500 text-white px-1 rounded text-xs ml-1">🔧 JASA</span>' : ''}</div>
                            ${isServiceItem && item.description ? `<div class="text-xs text-purple-600 italic mt-1">"${item.description}"</div>` : ''}
                        </td>
                        <td class="px-3 py-3 text-right text-lg">${formatCurrency(item.price)}</td>
                        <td class="px-3 py-3 text-center text-lg">
                            ${isServiceItem ? '1' : `
                                <div class="flex items-center justify-center space-x-1">
                                    <button onclick="updateQuantity(${item.id}, -1)" class="bg-red-500 hover:bg-red-600 text-white px-3 py-2 rounded text-sm">-</button>
                                    <input type="number" value="${item.quantity}" min="1" max="999" 
                                           class="w-16 px-2 py-1 border rounded text-base text-center" 
                                           onchange="setQuantity(${item.id}, this.value)"
                                           onkeypress="handleQuantityKeypress(event, ${item.id})"
                                           onclick="this.select()">
                                    <button onclick="updateQuantity(${item.id}, 1)" class="bg-green-500 hover:bg-green-600 text-white px-3 py-2 rounded text-sm">+</button>
                                </div>
                            `}
                        </td>
                        <td class="px-3 py-3 text-right font-bold text-lg">${formatCurrency(item.price * item.quantity)}</td>
                        <td class="px-3 py-3 text-center text-lg">
                            <button onclick="removeFromCart('${item.id}')" class="bg-gray-500 hover:bg-gray-600 text-white px-3 py-2 rounded text-sm">×</button>
                        </td>
                    </tr>
                `;
            }).join('');
        }

        function handleScannerTableSearch(event) {
            if (event.key === 'Enter') {
                event.preventDefault();
                const searchTerm = event.target.value.trim();
                
                if (searchTerm) {
                    const filtered = products.filter(product => {
                        const name = (product.name || '').toString().toLowerCase();
                        const barcode = (product.barcode || '').toString();
                        return name.includes(searchTerm.toLowerCase()) || barcode.includes(searchTerm);
                    });
                    
                    // If only one product matches, add it to cart automatically
                    if (filtered.length === 1) {
                        const product = filtered[0];
                        if (product.isService || product.price === 0 || product.stock > 0) {
                            const cartProduct = {
                                id: product.id,
                                name: product.name,
                                price: product.price,
                                stock: product.isService || product.price === 0 ? 999999 : product.stock
                            };
                            addToCart(cartProduct);
                            event.target.value = '';
                            displayScannerProductTable(); // Reset table display
                        } else {
                            alert(`Produk "${product.name}" stok habis!`);
                        }
                    } else if (filtered.length === 0) {
                        alert('Produk tidak ditemukan!');
                    }
                    // If multiple matches, keep showing filtered results
                }
            }
        }

        function searchScannerProducts(searchTerm) {
            const tableBody = document.getElementById('scannerProductTable');
            
            if (!searchTerm.trim()) {
                displayScannerProductTable();
                return;
            }

            const filtered = products.filter(product => {
                const name = (product.name || '').toString().toLowerCase();
                const barcode = (product.barcode || '').toString();
                return name.includes(searchTerm.toLowerCase()) || barcode.includes(searchTerm);
            });

            if (filtered.length === 0) {
                tableBody.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-gray-500">Tidak ada produk ditemukan</td></tr>';
                return;
            }

            // Sort filtered products by ID descending (newest first)
            const sortedFiltered = filtered.sort((a, b) => b.id - a.id);

            tableBody.innerHTML = sortedFiltered.map(product => {
                // Special handling for service products
                if (product.isService || product.price === 0) {
                    return `
                        <tr class="border-b border-gray-100 hover:bg-purple-50 bg-purple-25">
                            <td class="px-3 py-3">
                                <div class="font-medium text-gray-800">${product.name}</div>
                                <div class="text-xs text-purple-600 font-semibold">🔧 Produk Jasa</div>
                            </td>
                            <td class="px-3 py-3">
                                <div class="font-mono text-sm text-gray-400">
                                    Tidak ada
                                </div>
                            </td>
                            <td class="px-3 py-3 text-right">
                                <div class="font-bold text-purple-600">JASA</div>
                            </td>
                            <td class="px-3 py-3 text-center">
                                <span class="px-2 py-1 rounded-full text-xs font-semibold text-purple-600">
                                    ∞
                                </span>
                                <div class="text-xs text-purple-600 mt-1">UNLIMITED</div>
                            </td>
                            <td class="px-3 py-3 text-center">
                                <button onclick="addToCart({id: ${product.id}, name: '${product.name}', price: ${product.price}, stock: 999999})" 
                                        class="px-3 py-1 rounded text-xs font-semibold transition-colors bg-purple-500 hover:bg-purple-600 text-white">
                                    ➕ Tambah
                                </button>
                            </td>
                        </tr>
                    `;
                }
                
                // Regular product display
                const stockStatus = product.stock === 0 ? 'critical' : product.stock <= product.minStock ? 'low' : 'ok';
                const stockClass = stockStatus === 'critical' ? 'text-red-600 font-bold' : 
                                 stockStatus === 'low' ? 'text-yellow-600 font-semibold' : 'text-green-600';
                const rowClass = stockStatus === 'critical' ? 'bg-red-50' : 
                               stockStatus === 'low' ? 'bg-yellow-50' : '';
                
                return `
                    <tr class="border-b border-gray-100 hover:bg-blue-50 ${rowClass}">
                        <td class="px-3 py-3">
                            <div class="font-medium text-gray-800">${product.name}</div>
                            <div class="text-xs text-gray-500">Modal: ${formatCurrency(product.modalPrice || 0)}</div>
                        </td>
                        <td class="px-3 py-3">
                            <div class="font-mono text-sm ${product.barcode ? 'text-gray-700' : 'text-gray-400'}">
                                ${product.barcode || 'Tidak ada'}
                            </div>
                        </td>
                        <td class="px-3 py-3 text-right">
                            <div class="font-bold text-green-600">${formatCurrency(product.price)}</div>
                        </td>
                        <td class="px-3 py-3 text-center">
                            <span class="px-2 py-1 rounded-full text-xs font-semibold ${stockClass}">
                                ${product.stock}
                            </span>
                            ${stockStatus === 'critical' ? '<div class="text-xs text-red-500 mt-1">HABIS</div>' : 
                              stockStatus === 'low' ? '<div class="text-xs text-yellow-600 mt-1">MENIPIS</div>' : ''}
                        </td>
                        <td class="px-3 py-3 text-center">
                            <button onclick="addToCart({id: ${product.id}, name: '${product.name}', price: ${product.price}, stock: ${product.stock}})" 
                                    class="px-3 py-1 rounded text-xs font-semibold transition-colors ${product.stock === 0 ? 'bg-gray-400 text-white cursor-not-allowed' : 'bg-green-500 hover:bg-green-600 text-white'}"
                                    ${product.stock === 0 ? 'disabled' : ''}>
                                ${product.stock === 0 ? '❌ Habis' : '➕ Tambah'}
                            </button>
                        </td>
                    </tr>
                `;
            }).join('');
        }

        // Product management
        // Render products in grid layout
        function displayProductsGrid(list) {
            const container = document.getElementById('savedProducts');
            container.className = 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3';
            container.innerHTML = list.map(product => {
                // Service product
                if (product.isService || product.price === 0) {
                    return `
                        <div class="border-2 rounded-lg p-3 hover-lift bg-gradient-to-br from-purple-50 to-purple-100 border-purple-300">
                            <div class="font-semibold text-sm text-gray-800 truncate mb-1">${product.name}</div>
                            <div class="text-xs text-purple-600 font-bold mb-1">🔧 JASA</div>
                            <div class="text-xs text-gray-500 mb-1">Produk Layanan</div>
                            <div class="text-xs font-semibold mb-1 text-purple-600">
                                Stok: Unlimited
                            </div>
                            <div class="mb-2"></div>
                            <div class="flex space-x-1">
                                <button onclick="addToCart({id: ${product.id}, name: '${product.name}', price: ${product.price}, stock: 999999})" 
                                        class="flex-1 bg-purple-500 hover:bg-purple-600 text-white px-2 py-1 rounded text-xs font-semibold active-press">
                                    ➕
                                </button>
                                <button onclick="editProduct(${product.id})" 
                                        class="bg-blue-500 hover:bg-blue-600 text-white px-2 py-1 rounded text-xs font-semibold active-press">
                                    ✏️
                                </button>
                            </div>
                        </div>
                    `;
                }
                // Determine stock classes
                const stockStatusInner = product.stock === 0 ? 'critical' : product.stock <= product.minStock ? 'low' : 'ok';
                const stockClass = stockStatusInner === 'critical' ? 'stock-critical' : stockStatusInner === 'low' ? 'stock-low' : 'stock-ok';
                return `
                    <div class="border-2 rounded-lg p-3 hover-lift ${stockClass}">
                        <div class="font-semibold text-sm text-gray-800 truncate mb-1">${product.name}</div>
                        <div class="text-xs text-green-600 font-bold mb-1">${formatCurrency(product.price)}</div>
                        ${product.wholesaleMinQty && product.wholesalePrice ? 
                            `<div class="text-xs text-blue-600 font-semibold mb-1">🏪 ${formatCurrency(product.wholesalePrice)} (${product.wholesaleMinQty}+ pcs)</div>` : 
                            ''
                        }
                        <div class="text-xs text-gray-500 mb-1">Modal: ${formatCurrency(product.modalPrice || 0)}</div>
                        <div class="text-xs font-semibold mb-1 ${stockStatusInner === 'critical' ? 'text-red-600' : stockStatusInner === 'low' ? 'text-yellow-600' : 'text-green-600'}">
                            Stok: ${product.stock}
                        </div>
                        ${product.barcode ? `<div class="text-xs text-gray-400 mb-2">Barcode: ${product.barcode}</div>` : '<div class="mb-2"></div>'}
                        <div class="flex space-x-1">
                            <button onclick="addToCart({id: ${product.id}, name: '${product.name}', price: ${product.price}, stock: ${product.stock}})" 
                                    class="flex-1 ${product.stock === 0 ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-500 hover:bg-green-600'} text-white px-2 py-1 rounded text-xs font-semibold active-press"
                                    ${product.stock === 0 ? 'disabled' : ''}>
                                ${product.stock === 0 ? '❌' : '➕'}
                            </button>
                            <button onclick="editProduct(${product.id})" 
                                    class="bg-blue-500 hover:bg-blue-600 text-white px-2 py-1 rounded text-xs font-semibold active-press">
                                ✏️
                            </button>
                        </div>
                    </div>
                `;
            }).join('');
        }

        // Render products in table layout
        function displayProductsTable(list) {
            const container = document.getElementById('savedProducts');
            // Save the list to a global variable so sorting can operate on the
            // same dataset without re-filtering.  Use a shallow copy to avoid
            // mutating the original array passed in.
            currentTableList = Array.isArray(list) ? list.slice() : [];
            container.className = 'overflow-x-auto';
            let tableHtml = '<table class="w-full text-sm">';
            // Build table header with clickable columns for sorting
            tableHtml += '<thead class="bg-gray-100"><tr>' +
                         '<th class="px-4 py-2 text-left font-semibold text-gray-700 cursor-pointer" onclick="sortTableBy(\'name\')">Nama Produk</th>' +
                         '<th class="px-4 py-2 text-left font-semibold text-gray-700 cursor-pointer" onclick="sortTableBy(\'price\')">Harga</th>' +
                         '<th class="px-4 py-2 text-left font-semibold text-gray-700">Modal</th>' +
                         '<th class="px-4 py-2 text-left font-semibold text-gray-700 cursor-pointer" onclick="sortTableBy(\'stock\')">Stok</th>' +
                         '<th class="px-4 py-2 text-left font-semibold text-gray-700">Barcode</th>' +
                         '<th class="px-4 py-2 text-center font-semibold text-gray-700">Aksi</th>' +
                         '</tr></thead><tbody>';
            tableHtml += currentTableList.map(product => {
                const stockStatus = product.stock === 0 ? 'critical' : product.stock <= product.minStock ? 'low' : 'ok';
                const stockColor = stockStatus === 'critical' ? 'text-red-600' : stockStatus === 'low' ? 'text-yellow-600' : 'text-green-600';
                if (product.isService || product.price === 0) {
                    return `
                        <tr class="border-b border-gray-100 hover:bg-purple-50">
                            <td class="px-4 py-2 font-medium text-gray-800">${product.name}<div class="text-xs text-purple-600 font-semibold">🔧 JASA</div></td>
                            <td class="px-4 py-2 text-purple-600 font-bold">JASA</td>
                            <td class="px-4 py-2 text-gray-500">-</td>
                            <td class="px-4 py-2 ${stockColor}">∞</td>
                            <td class="px-4 py-2 text-gray-400">-</td>
                            <td class="px-4 py-2 text-center">
                                <button onclick="addToCart({id: ${product.id}, name: '${product.name}', price: ${product.price}, stock: 999999})" 
                                        class="px-2 py-1 rounded text-xs font-semibold transition-colors bg-purple-500 hover:bg-purple-600 text-white">
                                    ➕
                                </button>
                                <button onclick="editProduct(${product.id})" 
                                        class="ml-1 px-2 py-1 rounded text-xs font-semibold transition-colors bg-blue-500 hover:bg-blue-600 text-white">
                                    ✏️
                                </button>
                            </td>
                        </tr>
                    `;
                }
                return `
                    <tr class="border-b border-gray-100 hover:bg-blue-50">
                        <td class="px-4 py-2 font-medium text-gray-800">${product.name}</td>
                        <td class="px-4 py-2 text-green-600 font-bold">${formatCurrency(product.price)}</td>
                        <td class="px-4 py-2 text-gray-500">${formatCurrency(product.modalPrice || 0)}</td>
                        <td class="px-4 py-2 ${stockColor}">${product.stock}</td>
                        <td class="px-4 py-2 text-gray-400">${product.barcode || '-'}</td>
                        <td class="px-4 py-2 text-center">
                            <button onclick="addToCart({id: ${product.id}, name: '${product.name}', price: ${product.price}, stock: ${product.stock}})" 
                                    class="px-2 py-1 rounded text-xs font-semibold transition-colors ${product.stock === 0 ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-500 hover:bg-green-600'} text-white"
                                    ${product.stock === 0 ? 'disabled' : ''}>
                                ${product.stock === 0 ? '❌' : '➕'}
                            </button>
                            <button onclick="editProduct(${product.id})" 
                                    class="ml-1 px-2 py-1 rounded text-xs font-semibold transition-colors bg-blue-500 hover:bg-blue-600 text-white">
                                ✏️
                            </button>
                        </td>
                    </tr>
                `;
            }).join('');
            tableHtml += '</tbody></table>';
            container.innerHTML = tableHtml;
        }

        // Render products in list layout
        function displayProductsList(list) {
            const container = document.getElementById('savedProducts');
            container.className = 'space-y-3';
            container.innerHTML = list.map(product => {
                const stockStatus = product.stock === 0 ? 'critical' : product.stock <= product.minStock ? 'low' : 'ok';
                const stockColorClass = stockStatus === 'critical' ? 'text-red-600' : stockStatus === 'low' ? 'text-yellow-600' : 'text-green-600';
                if (product.isService || product.price === 0) {
                    return `
                        <div class="border-2 rounded-lg p-3 hover-lift bg-gradient-to-br from-purple-50 to-purple-100 border-purple-300 flex justify-between items-start">
                            <div>
                                <div class="font-semibold text-sm text-gray-800 mb-1">${product.name}</div>
                                <div class="text-xs text-purple-600 font-bold mb-1">🔧 JASA</div>
                                <div class="text-xs text-gray-500 mb-1">Produk Layanan</div>
                                <div class="text-xs font-semibold mb-1 text-purple-600">Stok: Unlimited</div>
                            </div>
                            <div class="flex space-x-1 mt-1 ml-2">
                                <button onclick="addToCart({id: ${product.id}, name: '${product.name}', price: ${product.price}, stock: 999999})" 
                                        class="bg-purple-500 hover:bg-purple-600 text-white px-2 py-1 rounded text-xs font-semibold active-press">
                                    ➕
                                </button>
                                <button onclick="editProduct(${product.id})" 
                                        class="bg-blue-500 hover:bg-blue-600 text-white px-2 py-1 rounded text-xs font-semibold active-press">
                                    ✏️
                                </button>
                            </div>
                        </div>
                    `;
                }
                const wholesaleInfo = (product.wholesaleMinQty && product.wholesalePrice) ? `<div class="text-xs text-blue-600 font-semibold mb-1">🏪 ${formatCurrency(product.wholesalePrice)} (${product.wholesaleMinQty}+ pcs)</div>` : '';
                return `
                    <div class="border-2 rounded-lg p-3 hover-lift ${stockStatus === 'critical' ? 'bg-red-50' : stockStatus === 'low' ? 'bg-yellow-50' : 'bg-gray-50'} flex justify-between items-start">
                        <div>
                            <div class="font-semibold text-sm text-gray-800 mb-1">${product.name}</div>
                            <div class="text-xs text-green-600 font-bold mb-1">${formatCurrency(product.price)}</div>
                            ${wholesaleInfo}
                            <div class="text-xs text-gray-500 mb-1">Modal: ${formatCurrency(product.modalPrice || 0)}</div>
                            <div class="text-xs font-semibold mb-1 ${stockColorClass}">Stok: ${product.stock}</div>
                            ${product.barcode ? `<div class="text-xs text-gray-400 mb-1">Barcode: ${product.barcode}</div>` : ''}
                        </div>
                        <div class="flex space-x-1 mt-1 ml-2">
                            <button onclick="addToCart({id: ${product.id}, name: '${product.name}', price: ${product.price}, stock: ${product.stock}})" 
                                    class="${product.stock === 0 ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-500 hover:bg-green-600'} text-white px-2 py-1 rounded text-xs font-semibold active-press"
                                    ${product.stock === 0 ? 'disabled' : ''}>
                                ${product.stock === 0 ? '❌' : '➕'}
                            </button>
                            <button onclick="editProduct(${product.id})" 
                                    class="bg-blue-500 hover:bg-blue-600 text-white px-2 py-1 rounded text-xs font-semibold active-press">
                                ✏️
                            </button>
                        </div>
                    </div>
                `;
            }).join('');
        }

        // Update the view mode buttons to reflect the current selection
        function updateViewButtons() {
            const modes = ['grid', 'table', 'list'];
            modes.forEach(mode => {
                const buttonId = 'view' + mode.charAt(0).toUpperCase() + mode.slice(1) + 'Button';
                const btn = document.getElementById(buttonId);
                if (!btn) return;
                if (productViewMode === mode) {
                    // Active button styling: green background and white text with green hover state
                    btn.classList.add('bg-green-500', 'text-white', 'hover:bg-green-600');
                    btn.classList.remove('bg-gray-200', 'text-gray-700', 'hover:bg-gray-300');
                } else {
                    // Inactive button styling: gray background and dark text with gray hover state
                    btn.classList.add('bg-gray-200', 'text-gray-700', 'hover:bg-gray-300');
                    btn.classList.remove('bg-green-500', 'text-white', 'hover:bg-green-600');
                }
            });
        }

        // Change the product view mode and render products accordingly
        function setProductViewMode(mode) {
            productViewMode = mode;
            // Check if there is an active search term
            const searchInput = document.getElementById('productSearchInput');
            const searchTerm = searchInput ? searchInput.value.trim() : '';
            if (searchTerm) {
                // Re-filter products based on the search term with the new view
                searchProducts(searchTerm);
            } else {
                // No search filter: sort and render all products in the selected mode
                const sorted = [...products].sort((a, b) => b.id - a.id);
                if (mode === 'table') {
                    displayProductsTable(sorted);
                } else if (mode === 'list') {
                    displayProductsList(sorted);
                } else {
                    displayProductsGrid(sorted);
                }
            }
            updateViewButtons();
        }

        function displaySavedProducts() {
            const container = document.getElementById('savedProducts');
            
            if (products.length === 0) {
                container.innerHTML = '<div class="col-span-full text-center text-gray-500 py-8">Belum ada produk</div>';
                return;
            }

            // Sort products by ID descending (newest first)
            const sortedProducts = [...products].sort((a, b) => b.id - a.id);

            container.innerHTML = sortedProducts.map(product => {
                // Special handling for service products
                if (product.isService || product.price === 0) {
                    return `
                        <div class="border-2 rounded-lg p-3 hover-lift bg-gradient-to-br from-purple-50 to-purple-100 border-purple-300">
                            <div class="font-semibold text-sm text-gray-800 truncate mb-1">${product.name}</div>
                            <div class="text-xs text-purple-600 font-bold mb-1">🔧 JASA</div>
                            <div class="text-xs text-gray-500 mb-1">Produk Layanan</div>
                            <div class="text-xs font-semibold mb-1 text-purple-600">
                                Stok: Unlimited
                            </div>
                            <div class="mb-2"></div>
                            
                            <div class="flex space-x-1">
                                <button onclick="addToCart({id: ${product.id}, name: '${product.name}', price: ${product.price}, stock: 999999})" 
                                        class="flex-1 bg-purple-500 hover:bg-purple-600 text-white px-2 py-1 rounded text-xs font-semibold active-press">
                                    ➕
                                </button>
                                <button onclick="editProduct(${product.id})" 
                                        class="bg-blue-500 hover:bg-blue-600 text-white px-2 py-1 rounded text-xs font-semibold active-press">
                                    ✏️
                                </button>
                            </div>
                        </div>
                    `;
                }
                
                // Regular product display
                const stockStatus = product.stock === 0 ? 'critical' : product.stock <= product.minStock ? 'low' : 'ok';
                const stockClass = stockStatus === 'critical' ? 'stock-critical' : stockStatus === 'low' ? 'stock-low' : 'stock-ok';
                
                return `
                    <div class="border-2 rounded-lg p-3 hover-lift ${stockClass}">
                        <div class="font-semibold text-sm text-gray-800 truncate mb-1">${product.name}</div>
                        <div class="text-xs text-green-600 font-bold mb-1">${formatCurrency(product.price)}</div>
                        ${product.wholesaleMinQty && product.wholesalePrice ? 
                            `<div class="text-xs text-blue-600 font-semibold mb-1">🏪 ${formatCurrency(product.wholesalePrice)} (${product.wholesaleMinQty}+ pcs)</div>` : 
                            ''
                        }
                        <div class="text-xs text-gray-500 mb-1">Modal: ${formatCurrency(product.modalPrice || 0)}</div>
                        <div class="text-xs font-semibold mb-1 ${stockStatus === 'critical' ? 'text-red-600' : stockStatus === 'low' ? 'text-yellow-600' : 'text-green-600'}">
                            Stok: ${product.stock}
                        </div>
                        ${product.barcode ? `<div class="text-xs text-gray-400 mb-2">Barcode: ${product.barcode}</div>` : '<div class="mb-2"></div>'}
                        
                        <div class="flex space-x-1">
                            <button onclick="addToCart({id: ${product.id}, name: '${product.name}', price: ${product.price}, stock: ${product.stock}})" 
                                    class="flex-1 ${product.stock === 0 ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-500 hover:bg-green-600'} text-white px-2 py-1 rounded text-xs font-semibold active-press"
                                    ${product.stock === 0 ? 'disabled' : ''}>
                                ${product.stock === 0 ? '❌' : '➕'}
                            </button>
                            <button onclick="editProduct(${product.id})" 
                                    class="bg-blue-500 hover:bg-blue-600 text-white px-2 py-1 rounded text-xs font-semibold active-press">
                                ✏️
                            </button>
                        </div>
                    </div>
                `;
            }).join('');
        }

        function searchProducts(searchTerm) {
            // If search term is empty, show all products in the current view mode
            if (!searchTerm.trim()) {
                const sorted = [...products].sort((a, b) => b.id - a.id);
                if (productViewMode === 'table') {
                    displayProductsTable(sorted);
                } else if (productViewMode === 'list') {
                    displayProductsList(sorted);
                } else {
                    displayProductsGrid(sorted);
                }
                return;
            }
            let filtered;
            try {
                // Filter products based on name or barcode
                filtered = products.filter(product => {
                    // Coerce properties to strings in case of undefined
                    const name = (product.name || '').toString().toLowerCase();
                    const barcode = (product.barcode || '').toString();
                    return name.includes(searchTerm.toLowerCase()) || barcode.includes(searchTerm);
                });
            } catch (err) {
                // If an error occurs (e.g. products is undefined or product has unexpected structure),
                // fall back to using the locally saved products from localStorage.  This ensures the
                // search functionality continues to work even after dynamic updates or import operations
                // that may replace or unset the global `products` array.
                try {
                    const stored = localStorage.getItem('kasir_products');
                    const fallbackList = stored ? JSON.parse(stored) : [];
                    filtered = fallbackList.filter(product => {
                        const name = (product.name || '').toString().toLowerCase();
                        const barcode = (product.barcode || '').toString();
                        return name.includes(searchTerm.toLowerCase()) || barcode.includes(searchTerm);
                    });
                } catch (_) {
                    filtered = [];
                }
            }
            if (!Array.isArray(filtered) || filtered.length === 0) {
                const container = document.getElementById('savedProducts');
                if (container) {
                    container.innerHTML = '<div class="col-span-full text-center text-gray-500 py-8">Tidak ada produk ditemukan</div>';
                }
                return;
            }
            // Sort filtered products by ID descending (newest first)
            const sortedFiltered = filtered.sort((a, b) => b.id - a.id);
            // Render the filtered list according to the current view mode
            if (productViewMode === 'table') {
                displayProductsTable(sortedFiltered);
            } else if (productViewMode === 'list') {
                displayProductsList(sortedFiltered);
            } else {
                displayProductsGrid(sortedFiltered);
            }
        }

        function showAddProductModal() {
            document.getElementById('addProductModal').classList.remove('hidden');
            document.getElementById('addProductModal').classList.add('flex');
        }

        function closeAddProductModal() {
            document.getElementById('addProductModal').classList.add('hidden');
            document.getElementById('addProductModal').classList.remove('flex');
            // Clear form
            document.getElementById('newProductName').value = '';
            document.getElementById('newProductPrice').value = '';
            document.getElementById('newProductModalPrice').value = '';
            document.getElementById('newProductBarcode').value = '';
            document.getElementById('newProductStock').value = '0';
            document.getElementById('newProductMinStock').value = '5';
            document.getElementById('newProductWholesaleMinQty').value = '';
            document.getElementById('newProductWholesalePrice').value = '';
        }

        function saveNewProduct() {
            const name = document.getElementById('newProductName').value.trim();
            const price = parseInt(document.getElementById('newProductPrice').value) || 0;
            const modalPrice = parseInt(document.getElementById('newProductModalPrice').value) || 0;
            const barcode = document.getElementById('newProductBarcode').value.trim();
            const stock = parseInt(document.getElementById('newProductStock').value) || 0;
            const minStock = parseInt(document.getElementById('newProductMinStock').value) || 5;
            const wholesaleMinQty = parseInt(document.getElementById('newProductWholesaleMinQty').value) || 0;
            const wholesalePrice = parseInt(document.getElementById('newProductWholesalePrice').value) || 0;

            if (!name) {
                alert('Nama produk harus diisi!');
                return;
            }

            // Validate wholesale pricing if provided
            if (wholesaleMinQty > 0 || wholesalePrice > 0) {
                if (wholesaleMinQty < 2) {
                    alert('Minimal quantity grosir harus minimal 2!');
                    return;
                }
                if (wholesalePrice <= 0) {
                    alert('Harga grosir harus diisi jika ada minimal quantity!');
                    return;
                }
                if (wholesalePrice >= price) {
                    alert('Harga grosir harus lebih kecil dari harga normal!');
                    return;
                }
                if (wholesalePrice <= modalPrice) {
                    alert('Harga grosir harus lebih besar dari harga modal!');
                    return;
                }
            }

            // Special handling for service products (price = 0)
            if (price === 0) {
                const newProduct = {
                    id: Date.now(),
                    name: name,
                    price: 0,
                    modalPrice: 0,
                    barcode: null,
                    stock: 999999, // Unlimited stock for services
                    minStock: 0,
                    isService: true
                };

                products.push(newProduct);
                // Sync new service product to server database so it persists across devices.
                // Only attempt to sync when running over HTTP/HTTPS; when the app is opened via the file protocol,
                // the request will fail due to CORS/same-origin restrictions, so we skip it to avoid console errors.
                if (window.location.protocol.startsWith('http')) {
                    fetch('/api/products', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(newProduct)
                    }).catch(err => console.error('Failed to sync new service product', err));
                }
                saveData();
                // Remove any duplicate products to keep the list clean
                removeDuplicateProducts();
                // Re-render products according to the current view mode instead of always switching to the grid view.
                const sortedAfterAddService = [...products].sort((a, b) => b.id - a.id);
                if (productViewMode === 'table') {
                    displayProductsTable(sortedAfterAddService);
                } else if (productViewMode === 'list') {
                    displayProductsList(sortedAfterAddService);
                } else {
                    displayProductsGrid(sortedAfterAddService);
                }
                // Update the view buttons to reflect the current mode
                updateViewButtons();
                // Refresh the scanner tab's product table so the new service appears
                displayScannerProductTable();
                // Close the add product modal
                closeAddProductModal();
                alert(`Produk jasa "${name}" berhasil ditambahkan!`);
                // Sync only the new service product to Google Sheets
                try {
                    sendDeltaToGoogleSheets('add', 'products', productToRow(newProduct)).catch(err => console.error('Auto sync failed:', err));
                } catch (err) {
                    console.error('Auto sync failed:', err);
                }
                return;
            }

            // Regular product validation
            if (price < 0 || modalPrice < 0 || stock < 0) {
                alert('Harga dan stok tidak boleh negatif!');
                return;
            }

            if (modalPrice >= price) {
                alert('Harga modal harus lebih kecil dari harga jual!');
                return;
            }

            if (barcode && products.some(p => p.barcode === barcode)) {
                alert('Barcode sudah digunakan!');
                return;
            }

            const newProduct = {
                id: Date.now(),
                name: name,
                price: price,
                modalPrice: modalPrice,
                barcode: barcode || null,
                stock: stock,
                minStock: minStock,
                isService: false,
                wholesaleMinQty: wholesaleMinQty > 0 ? wholesaleMinQty : null,
                wholesalePrice: wholesalePrice > 0 ? wholesalePrice : null
            };

            products.push(newProduct);
            // Sync new product to server database so it persists across devices
            // Only attempt to sync when running over HTTP/HTTPS; skip when using the file protocol to avoid CORS errors
            if (window.location.protocol.startsWith('http')) {
                fetch('/api/products', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(newProduct)
                }).catch(err => console.error('Failed to sync new product', err));
            }
            saveData();
            // Remove any duplicate products to keep the list tidy
            removeDuplicateProducts();
            // Re-render the product list according to the current view mode.  Using displaySavedProducts() would force
            // the grid view and disrupt the table/list view.
            const sortedAfterAddRegular = [...products].sort((a, b) => b.id - a.id);
            if (productViewMode === 'table') {
                displayProductsTable(sortedAfterAddRegular);
            } else if (productViewMode === 'list') {
                displayProductsList(sortedAfterAddRegular);
            } else {
                displayProductsGrid(sortedAfterAddRegular);
            }
            // Update view buttons to reflect the current mode
            updateViewButtons();
            // Refresh the scanner tab's product table so the new product appears
            displayScannerProductTable();
            // Close the add product modal
            closeAddProductModal();
            
            let message = `Produk "${name}" berhasil ditambahkan!`;
            if (wholesaleMinQty > 0 && wholesalePrice > 0) {
                message += `\n🏪 Harga grosir: ${formatCurrency(wholesalePrice)} (min ${wholesaleMinQty} pcs)`;
            }
            alert(message);
            // Sync only the new product to Google Sheets
            try {
                sendDeltaToGoogleSheets('add', 'products', productToRow(newProduct)).catch(err => console.error('Auto sync failed:', err));
            } catch (err) {
                console.error('Auto sync failed:', err);
            }
        }

        // Edit product functions
        let editingProductId = null;

        function editProduct(productId) {
            const product = products.find(p => p.id === productId);
            if (!product) {
                alert('Produk tidak ditemukan!');
                return;
            }

            editingProductId = productId;
            
            // Fill form with current product data
            document.getElementById('editProductName').value = product.name;
            document.getElementById('editProductPrice').value = product.price;
            document.getElementById('editProductModalPrice').value = product.modalPrice || 0;
            document.getElementById('editProductBarcode').value = product.barcode || '';
            document.getElementById('editProductStock').value = product.stock;
            document.getElementById('editProductMinStock').value = product.minStock;
            document.getElementById('editProductWholesaleMinQty').value = product.wholesaleMinQty || '';
            document.getElementById('editProductWholesalePrice').value = product.wholesalePrice || '';

            // Show modal
            document.getElementById('editProductModal').classList.remove('hidden');
            document.getElementById('editProductModal').classList.add('flex');
        }

        function closeEditProductModal() {
            document.getElementById('editProductModal').classList.add('hidden');
            document.getElementById('editProductModal').classList.remove('flex');
            editingProductId = null;
            
            // Clear form
            document.getElementById('editProductName').value = '';
            document.getElementById('editProductPrice').value = '';
            document.getElementById('editProductModalPrice').value = '';
            document.getElementById('editProductBarcode').value = '';
            document.getElementById('editProductStock').value = '';
            document.getElementById('editProductMinStock').value = '';
            document.getElementById('editProductWholesaleMinQty').value = '';
            document.getElementById('editProductWholesalePrice').value = '';
        }

        function saveEditedProduct() {
            if (!editingProductId) {
                alert('Error: Tidak ada produk yang sedang diedit!');
                return;
            }

            const name = document.getElementById('editProductName').value.trim();
            const price = parseInt(document.getElementById('editProductPrice').value) || 0;
            const modalPrice = parseInt(document.getElementById('editProductModalPrice').value) || 0;
            const barcode = document.getElementById('editProductBarcode').value.trim();
            const stock = parseInt(document.getElementById('editProductStock').value) || 0;
            const minStock = parseInt(document.getElementById('editProductMinStock').value) || 5;
            const wholesaleMinQty = parseInt(document.getElementById('editProductWholesaleMinQty').value) || 0;
            const wholesalePrice = parseInt(document.getElementById('editProductWholesalePrice').value) || 0;

            if (!name || price <= 0 || modalPrice < 0 || stock < 0) {
                alert('Mohon isi semua field dengan benar!');
                return;
            }

            if (modalPrice >= price) {
                alert('Harga modal harus lebih kecil dari harga jual!');
                return;
            }

            // Validate wholesale pricing if provided
            if (wholesaleMinQty > 0 || wholesalePrice > 0) {
                if (wholesaleMinQty < 2) {
                    alert('Minimal quantity grosir harus minimal 2!');
                    return;
                }
                if (wholesalePrice <= 0) {
                    alert('Harga grosir harus diisi jika ada minimal quantity!');
                    return;
                }
                if (wholesalePrice >= price) {
                    alert('Harga grosir harus lebih kecil dari harga normal!');
                    return;
                }
                if (wholesalePrice <= modalPrice) {
                    alert('Harga grosir harus lebih besar dari harga modal!');
                    return;
                }
            }

            // Check if barcode is already used by another product
            if (barcode && products.some(p => p.barcode === barcode && p.id !== editingProductId)) {
                alert('Barcode sudah digunakan oleh produk lain!');
                return;
            }

            // Find and update the product
            const productIndex = products.findIndex(p => p.id === editingProductId);
            if (productIndex === -1) {
                alert('Produk tidak ditemukan!');
                return;
            }

            products[productIndex] = {
                ...products[productIndex],
                name: name,
                price: price,
                modalPrice: modalPrice,
                barcode: barcode || null,
                stock: stock,
                minStock: minStock,
                wholesaleMinQty: wholesaleMinQty > 0 ? wholesaleMinQty : null,
                wholesalePrice: wholesalePrice > 0 ? wholesalePrice : null
            };

            saveData();
            // Refresh the product display according to the current view mode.  Using
            // displaySavedProducts() here would unconditionally render the grid
            // view, which disrupts the selected table or list view.  Instead we
            // choose the appropriate display function based on productViewMode.
            const sorted = [...products].sort((a, b) => b.id - a.id);
            if (productViewMode === 'table') {
                displayProductsTable(sorted);
            } else if (productViewMode === 'list') {
                displayProductsList(sorted);
            } else {
                displayProductsGrid(sorted);
            }
            // Update view buttons to reflect current mode after re-render
            updateViewButtons();
            // Refresh the scanner tab's cart table
            displayScannerProductTable();
            // Close the edit modal
            closeEditProductModal();

            let message = `Produk "${name}" berhasil diupdate!`;
            if (wholesaleMinQty > 0 && wholesalePrice > 0) {
                message += `\n🏪 Harga grosir: ${formatCurrency(wholesalePrice)} (min ${wholesaleMinQty} pcs)`;
            }
            alert(message);
            // Sync the updated product to Google Sheets
            try {
                const updatedProduct = products.find(p => p.id === editingProductId);
                if (updatedProduct) {
                    sendDeltaToGoogleSheets('update', 'products', productToRow(updatedProduct)).catch(err => console.error('Auto sync failed:', err));
                }
            } catch (err) {
                console.error('Auto sync failed:', err);
            }
        }

        function deleteProduct() {
            if (!editingProductId) {
                alert('Error: Tidak ada produk yang sedang diedit!');
                return;
            }

            const product = products.find(p => p.id === editingProductId);
            if (!product) {
                alert('Produk tidak ditemukan!');
                return;
            }

            // Use custom confirmation layer instead of native confirm()
            const confirmMessage = `Yakin ingin menghapus produk "${product.name}"?\n\nPerhatian: Data ini tidak dapat dikembalikan!`;
            showConfirmLayer(confirmMessage, function(confirmed) {
                if (!confirmed) return;
                // Remove product from array
                const productIndex = products.findIndex(p => p.id === editingProductId);
                if (productIndex !== -1) {
                    products.splice(productIndex, 1);
                    // Save the updated list to persistent storage
                    saveData();
                    // After deleting a product, re-render the product list in the same
                    // view mode the user is currently using.  Previously this function
                    // always called displaySavedProducts() (grid view), which caused
                    // the layout to switch unexpectedly when a user was in table or
                    // list view.  Use productViewMode to determine which renderer to
                    // invoke and sort by ID descending to mimic grid ordering.
                    const sortedList = [...products].sort((a, b) => b.id - a.id);
                    if (productViewMode === 'table') {
                        displayProductsTable(sortedList);
                    } else if (productViewMode === 'list') {
                        displayProductsList(sortedList);
                    } else {
                        displaySavedProducts();
                    }
                    // Also update the scanner product table to remove the deleted
                    // product from quick-scan suggestions.
                    displayScannerProductTable();
                    // Capture the ID before it gets reset so we can sync deletion
                    const idToDelete = editingProductId;
                    // Close the edit modal (this will reset editingProductId)
                    closeEditProductModal();
                    alert(`Produk "${product.name}" berhasil dihapus!`);
                    // Sync deletion of this product to Google Sheets using the captured ID
                    try {
                        sendDeltaToGoogleSheets('delete', 'products', idToDelete).catch(err => console.error('Auto sync failed:', err));
                    } catch (err) {
                        console.error('Auto sync failed:', err);
                    }
                }
            });
        }

        // Unified Payment functions
        function showUnifiedPaymentModal() {
            if (cart.length === 0) {
                alert('Keranjang masih kosong!');
                return;
            }

            // Hitung total bayar dengan memperhitungkan diskon per item dan diskon global.
            let intermediateTotal = 0;
            cart.forEach(item => {
                const itemSubtotal = item.price * item.quantity;
                let itemDiscount = 0;
                if (item.discountType === 'percent') {
                    itemDiscount = itemSubtotal * (item.discountValue || 0) / 100;
                } else {
                    itemDiscount = item.discountValue || 0;
                }
                if (itemDiscount > itemSubtotal) itemDiscount = itemSubtotal;
                intermediateTotal += (itemSubtotal - itemDiscount);
            });
            const discountInputEl = document.getElementById('discountInput');
            const discountTypeEl = document.getElementById('discountType');
            const globalValue = discountInputEl ? parseInt(discountInputEl.value) || 0 : 0;
            const globalType = discountTypeEl ? discountTypeEl.value : 'percent';
            let globalAmount = 0;
            if (globalType === 'percent') {
                globalAmount = intermediateTotal * globalValue / 100;
            } else {
                globalAmount = globalValue;
            }
            if (globalAmount > intermediateTotal) globalAmount = intermediateTotal;
            const total = intermediateTotal - globalAmount;

            document.getElementById('unifiedPaymentTotal').textContent = formatCurrency(total);
            document.getElementById('unifiedPaymentAmount').value = '';
            document.getElementById('unifiedCustomerName').value = '';
            
            // Hide customer name section initially
            document.getElementById('customerNameSection').classList.add('hidden');
            
            // Reset payment status
            const statusContainer = document.getElementById('paymentStatusContainer');
            statusContainer.className = 'bg-gray-50 p-4 rounded-lg';
            document.getElementById('paymentStatusLabel').textContent = 'Status pembayaran:';
            document.getElementById('paymentStatusAmount').textContent = 'Masukkan jumlah bayar';
            document.getElementById('paymentStatusAmount').className = 'text-xl font-bold text-gray-600';
            document.getElementById('paymentStatusHint').textContent = '';
            
            document.getElementById('unifiedPaymentModal').classList.remove('hidden');
            document.getElementById('unifiedPaymentModal').classList.add('flex');
            
            setTimeout(() => document.getElementById('unifiedPaymentAmount').focus(), 100);
        }

        function closeUnifiedPaymentModal() {
            document.getElementById('unifiedPaymentModal').classList.add('hidden');
            document.getElementById('unifiedPaymentModal').classList.remove('flex');
        }

        function calculateUnifiedPayment() {
            // Hitung total dengan diskon per item + diskon global
            let intermediateTotal = 0;
            cart.forEach(item => {
                const itemSubtotal = item.price * item.quantity;
                let itemDiscount = 0;
                if (item.discountType === 'percent') {
                    itemDiscount = itemSubtotal * (item.discountValue || 0) / 100;
                } else {
                    itemDiscount = item.discountValue || 0;
                }
                if (itemDiscount > itemSubtotal) itemDiscount = itemSubtotal;
                intermediateTotal += (itemSubtotal - itemDiscount);
            });
            const discountInputEl = document.getElementById('discountInput');
            const discountTypeEl = document.getElementById('discountType');
            const globalValue = discountInputEl ? parseInt(discountInputEl.value) || 0 : 0;
            const globalType = discountTypeEl ? discountTypeEl.value : 'percent';
            let globalAmount = 0;
            if (globalType === 'percent') {
                globalAmount = intermediateTotal * globalValue / 100;
            } else {
                globalAmount = globalValue;
            }
            if (globalAmount > intermediateTotal) globalAmount = intermediateTotal;
            const total = intermediateTotal - globalAmount;
            const paid = parseInt(document.getElementById('unifiedPaymentAmount').value) || 0;
            
            const statusContainer = document.getElementById('paymentStatusContainer');
            const statusLabel = document.getElementById('paymentStatusLabel');
            const statusAmount = document.getElementById('paymentStatusAmount');
            const statusHint = document.getElementById('paymentStatusHint');
            const customerNameSection = document.getElementById('customerNameSection');
            
            if (paid === 0) {
                // No payment entered
                statusContainer.className = 'bg-gray-50 p-4 rounded-lg';
                statusLabel.textContent = 'Status pembayaran:';
                statusAmount.textContent = 'Masukkan jumlah bayar';
                statusAmount.className = 'text-xl font-bold text-gray-600';
                statusHint.textContent = '';
                customerNameSection.classList.add('hidden');
            } else if (paid < total) {
                // Insufficient payment - will be partial payment
                const debt = total - paid;
                const percentage = ((paid / total) * 100).toFixed(1);
                statusContainer.className = 'bg-red-50 p-4 rounded-lg';
                statusLabel.textContent = 'Kurang Bayar:';
                statusAmount.textContent = formatCurrency(debt);
                statusAmount.className = 'text-xl font-bold text-red-600';
                statusHint.textContent = `💡 Masih kurang ${formatCurrency(debt)} lagi`;
                statusHint.className = 'text-xs mt-1 text-red-600 font-medium';
                customerNameSection.classList.remove('hidden');
            } else if (paid === total) {
                // Exact payment
                statusContainer.className = 'bg-green-50 p-4 rounded-lg';
                statusLabel.textContent = 'Pembayaran:';
                statusAmount.textContent = 'PAS! 🎯';
                statusAmount.className = 'text-xl font-bold text-green-600';
                statusHint.textContent = '✅ Pembayaran tepat, tidak ada kembalian';
                statusHint.className = 'text-xs mt-1 text-green-600 font-medium';
                customerNameSection.classList.add('hidden');
            } else {
                // Overpayment - full payment with change
                const change = paid - total;
                statusContainer.className = 'bg-blue-50 p-4 rounded-lg';
                statusLabel.textContent = 'Kembalian:';
                statusAmount.textContent = formatCurrency(change);
                statusAmount.className = 'text-xl font-bold text-blue-600';
                statusHint.textContent = '💰 Kembalian untuk pelanggan';
                statusHint.className = 'text-xs mt-1 text-blue-600 font-medium';
                customerNameSection.classList.add('hidden');
            }
        }

        function handleUnifiedPaymentEnter(event) {
            if (event.key === 'Enter') {
                event.preventDefault();
                processUnifiedPayment();
            }
        }

        function processUnifiedPayment() {
            // Hitung subtotal awal, total diskon per item, subtotal setelah diskon item, kemudian diskon global
            let itemsSubtotal = 0;
            let itemsDiscountTotal = 0;
            let intermediateTotal = 0;
            cart.forEach(item => {
                const itemSubtotal = item.price * item.quantity;
                itemsSubtotal += itemSubtotal;
                let itemDiscount = 0;
                if (item.discountType === 'percent') {
                    itemDiscount = itemSubtotal * (item.discountValue || 0) / 100;
                } else {
                    itemDiscount = item.discountValue || 0;
                }
                if (itemDiscount > itemSubtotal) itemDiscount = itemSubtotal;
                itemsDiscountTotal += itemDiscount;
                intermediateTotal += (itemSubtotal - itemDiscount);
            });
            // Global discount
            const discountInputEl = document.getElementById('discountInput');
            const discountTypeEl = document.getElementById('discountType');
            const globalValue = discountInputEl ? parseInt(discountInputEl.value) || 0 : 0;
            const globalType = discountTypeEl ? discountTypeEl.value : 'percent';
            let globalAmount = 0;
            if (globalType === 'percent') {
                globalAmount = intermediateTotal * globalValue / 100;
            } else {
                globalAmount = globalValue;
            }
            if (globalAmount > intermediateTotal) globalAmount = intermediateTotal;
            const total = intermediateTotal - globalAmount;
            const paid = parseInt(document.getElementById('unifiedPaymentAmount').value) || 0;

            if (paid <= 0) {
                alert('Jumlah bayar harus lebih dari 0!');
                return;
            }

            if (paid < total) {
                // Partial payment - need customer name
                const customerName = document.getElementById('unifiedCustomerName').value.trim();
                if (!customerName) {
                    alert('Mohon isi nama pelanggan untuk pembayaran hutang!');
                    return;
                }
                processPartialPaymentUnified(itemsSubtotal, itemsDiscountTotal, intermediateTotal, globalValue, globalAmount, globalType, total, paid, customerName);
            } else {
                // Full payment (exact or with change)
                processFullPaymentUnified(itemsSubtotal, itemsDiscountTotal, intermediateTotal, globalValue, globalAmount, globalType, total, paid);
            }
        }

        function processFullPaymentUnified(itemsSubtotal, itemsDiscountTotal, intermediateSubtotal, globalDiscountValue, globalDiscountAmount, globalDiscountType, total, paid) {
            // Build a transaction object that includes item-level and global discount
            const transaction = {
                id: Date.now(),
                items: [...cart],
                // Total of all items before any discounts
                itemsSubtotal: itemsSubtotal,
                // Total discount applied on individual items
                itemsDiscountTotal: itemsDiscountTotal,
                // Subtotal after item discounts but before global discount
                subtotal: intermediateSubtotal,
                // For backward compatibility store global discount value and type like previous discount fields
                discount: globalDiscountValue,
                discountValue: globalDiscountValue,
                discountAmount: globalDiscountAmount,
                discountType: globalDiscountType,
                // Also keep named fields describing global discount
                globalDiscountValue: globalDiscountValue,
                globalDiscountAmount: globalDiscountAmount,
                globalDiscountType: globalDiscountType,
                total: total,
                paid: paid,
                change: paid - total,
                timestamp: new Date().toISOString(),
                type: 'full'
            };

            // Update stock
            cart.forEach(item => {
                const product = products.find(p => p.id === item.id);
                if (product) {
                    product.stock -= item.quantity;
                }
            });

            salesData.push(transaction);
            saveData();

            // Instead of printing immediately, show a receipt preview.
            // Store a callback that will run after the user chooses to print or close the preview.
            pendingFinalizeCallback = function() {
                // Clear cart
                cart = [];
                updateCartDisplay();
                updateTotal();
                closeUnifiedPaymentModal();

                // Close cart automatically
                const floatingCart = document.getElementById('floatingCart');
                const cartToggle = document.getElementById('cartToggle');
                floatingCart.classList.add('hidden');
                cartToggle.classList.remove('hidden');

                // Show success message based on whether there is change
                if (paid === total) {
                    alert('Pembayaran berhasil! Pembayaran pas, tidak ada kembalian.');
                } else {
                    alert(`Pembayaran berhasil! Kembalian: ${formatCurrency(paid - total)}`);
                }
                displaySavedProducts(); // Refresh product display
                displayScannerProductTable(); // Refresh scanner table
                // Synchronize the sale and updated product stocks with Google Sheets
                try {
                    // Send the new sale record
                    sendDeltaToGoogleSheets('add', 'sales', saleToRow(transaction)).catch(err => console.error('Auto sync failed:', err));
                    // Send stock updates for each purchased product
                    transaction.items.forEach(item => {
                        const p = products.find(prod => prod.id === item.id);
                        if (p) {
                            sendDeltaToGoogleSheets('update', 'products', productToRow(p)).catch(err => console.error('Auto sync failed:', err));
                        }
                    });
                } catch (err) {
                    console.error('Auto sync failed:', err);
                }
            };
            showReceiptPreview(transaction);
            return;
        }

        function processPartialPaymentUnified(itemsSubtotal, itemsDiscountTotal, intermediateSubtotal, globalDiscountValue, globalDiscountAmount, globalDiscountType, total, paid, customerName) {
            const debt = total - paid;
            // Build transaction for partial payment including detailed discount fields
            const transaction = {
                id: Date.now(),
                items: [...cart],
                itemsSubtotal: itemsSubtotal,
                itemsDiscountTotal: itemsDiscountTotal,
                subtotal: intermediateSubtotal,
                // Compatibility fields for old discount reporting
                discount: globalDiscountValue,
                discountValue: globalDiscountValue,
                discountAmount: globalDiscountAmount,
                discountType: globalDiscountType,
                // Explicit global discount fields
                globalDiscountValue: globalDiscountValue,
                globalDiscountAmount: globalDiscountAmount,
                globalDiscountType: globalDiscountType,
                total: total,
                paid: paid,
                debt: debt,
                customerName: customerName,
                timestamp: new Date().toISOString(),
                type: 'partial'
            };

            // Update stock
            cart.forEach(item => {
                const product = products.find(p => p.id === item.id);
                if (product) {
                    product.stock -= item.quantity;
                }
            });

            // Add to debt data
            const existingDebt = debtData.find(d => d.customerName === customerName);
            if (existingDebt) {
                existingDebt.amount += debt;
                existingDebt.transactions.push({
                    id: transaction.id,
                    amount: debt,
                    date: new Date().toLocaleDateString('id-ID')
                });
            } else {
                debtData.push({
                    customerName: customerName,
                    amount: debt,
                    transactions: [{
                        id: transaction.id,
                        amount: debt,
                        date: new Date().toLocaleDateString('id-ID')
                    }]
                });
            }

            salesData.push(transaction);
            saveData();

            // Instead of printing immediately, show a receipt preview.
            // Store a callback that will run after the user chooses to print or close the preview.
            pendingFinalizeCallback = function() {
                // Clear cart
                cart = [];
                updateCartDisplay();
                updateTotal();
                closeUnifiedPaymentModal();

                // Close cart automatically
                const floatingCart = document.getElementById('floatingCart');
                const cartToggle = document.getElementById('cartToggle');
                floatingCart.classList.add('hidden');
                cartToggle.classList.remove('hidden');

                alert(`Transaksi berhasil! Hutang ${customerName}: ${formatCurrency(debt)}`);
                displaySavedProducts(); // Refresh product display
                displayScannerProductTable(); // Refresh scanner table
                // Synchronize the sale, updated product stocks and debt record to Google Sheets
                try {
                    // Send the new sale record
                    sendDeltaToGoogleSheets('add', 'sales', saleToRow(transaction)).catch(err => console.error('Auto sync failed:', err));
                    // Send stock updates for each purchased product
                    transaction.items.forEach(item => {
                        const p = products.find(prod => prod.id === item.id);
                        if (p) {
                            sendDeltaToGoogleSheets('update', 'products', productToRow(p)).catch(err => console.error('Auto sync failed:', err));
                        }
                    });
                    // Send the updated debt record
                    const debtRecord = debtData.find(d => d.customerName === customerName);
                    if (debtRecord) {
                        sendDeltaToGoogleSheets('update', 'debts', debtToRow(debtRecord)).catch(err => console.error('Auto sync failed:', err));
                    }
                } catch (err) {
                    console.error('Auto sync failed:', err);
                }
            };
            showReceiptPreview(transaction);
            return;
        }

        function handlePaymentEnter(event) {
            if (event.key === 'Enter') {
                event.preventDefault();
                processPayment();
            }
        }

        function handlePartialPaymentEnter(event) {
            if (event.key === 'Enter') {
                event.preventDefault();
                processPartialPayment();
            }
        }

        function handleDebtPaymentEnter(event) {
            if (event.key === 'Enter') {
                event.preventDefault();
                processDebtPayment();
            }
        }

        function showPartialPaymentModal() {
            if (cart.length === 0) {
                alert('Keranjang masih kosong!');
                return;
            }

            const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
            const discount = parseInt(document.getElementById('discountInput').value) || 0;
            const total = subtotal - (subtotal * discount / 100);

            document.getElementById('partialTotal').textContent = formatCurrency(total);
            document.getElementById('customerName').value = '';
            document.getElementById('partialAmount').value = '';
            document.getElementById('debtAmount').textContent = formatCurrency(total);
            
            document.getElementById('partialPaymentModal').classList.remove('hidden');
            document.getElementById('partialPaymentModal').classList.add('flex');
        }

        function closePartialPaymentModal() {
            document.getElementById('partialPaymentModal').classList.add('hidden');
            document.getElementById('partialPaymentModal').classList.remove('flex');
        }

        function calculatePartialDebt() {
            const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
            const discount = parseInt(document.getElementById('discountInput').value) || 0;
            const total = subtotal - (subtotal * discount / 100);
            const paid = parseInt(document.getElementById('partialAmount').value) || 0;
            const difference = total - paid;
            
            const debtContainer = document.getElementById('debtContainer');
            const debtLabel = document.getElementById('debtLabel');
            const debtAmount = document.getElementById('debtAmount');
            const debtStatus = document.getElementById('debtStatus');
            
            if (paid === 0) {
                // No payment entered
                debtContainer.className = 'bg-red-50 p-4 rounded-lg';
                debtLabel.textContent = 'Sisa hutang:';
                debtAmount.textContent = formatCurrency(total);
                debtAmount.className = 'text-xl font-bold text-red-600';
                debtStatus.textContent = '';
            } else if (paid >= total) {
                // Full payment or overpayment
                debtContainer.className = 'bg-green-50 p-4 rounded-lg';
                debtLabel.textContent = 'Status:';
                debtAmount.textContent = 'LUNAS! ✅';
                debtAmount.className = 'text-xl font-bold text-green-600';
                if (paid > total) {
                    debtStatus.textContent = `💰 Kembalian: ${formatCurrency(paid - total)}`;
                    debtStatus.className = 'text-xs mt-1 text-green-600 font-medium';
                } else {
                    debtStatus.textContent = '🎯 Pembayaran tepat, tidak ada hutang';
                    debtStatus.className = 'text-xs mt-1 text-green-600 font-medium';
                }
            } else {
                // Partial payment
                const debt = difference;
                const percentage = ((paid / total) * 100).toFixed(1);
                debtContainer.className = 'bg-orange-50 p-4 rounded-lg';
                debtLabel.textContent = 'Sisa hutang:';
                debtAmount.textContent = formatCurrency(debt);
                debtAmount.className = 'text-xl font-bold text-orange-600';
                debtStatus.textContent = `💳 Sudah bayar ${percentage}% (${formatCurrency(paid)})`;
                debtStatus.className = 'text-xs mt-1 text-orange-600 font-medium';
            }
        }

        function processPartialPayment() {
            const customerName = document.getElementById('customerName').value.trim();
            const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
            const discount = parseInt(document.getElementById('discountInput').value) || 0;
            const total = subtotal - (subtotal * discount / 100);
            const paid = parseInt(document.getElementById('partialAmount').value) || 0;
            const debt = total - paid;

            if (!customerName) {
                alert('Mohon isi nama pelanggan!');
                return;
            }

            if (paid <= 0 || paid >= total) {
                alert('Jumlah bayar tidak valid!');
                return;
            }

            const transaction = {
                id: Date.now(),
                items: [...cart],
                subtotal: subtotal,
                discount: discount,
                total: total,
                paid: paid,
                debt: debt,
                customerName: customerName,
                timestamp: new Date().toISOString(),
                type: 'partial'
            };

            // Update stock
            cart.forEach(item => {
                const product = products.find(p => p.id === item.id);
                if (product) {
                    product.stock -= item.quantity;
                }
            });

            // Add to debt data
            const existingDebt = debtData.find(d => d.customerName === customerName);
            if (existingDebt) {
                existingDebt.amount += debt;
                existingDebt.transactions.push({
                    id: transaction.id,
                    amount: debt,
                    date: new Date().toLocaleDateString('id-ID')
                });
            } else {
                debtData.push({
                    customerName: customerName,
                    amount: debt,
                    transactions: [{
                        id: transaction.id,
                        amount: debt,
                        date: new Date().toLocaleDateString('id-ID')
                    }]
                });
            }

            salesData.push(transaction);
            saveData();

            // Instead of printing immediately, show a receipt preview.
            // Store a callback that will run after the user chooses to print or close the preview.
            pendingFinalizeCallback = function() {
                // Clear cart
                cart = [];
                updateCartDisplay();
                updateTotal();
                closePartialPaymentModal();

                // Close cart automatically
                const floatingCart = document.getElementById('floatingCart');
                const cartToggle = document.getElementById('cartToggle');
                floatingCart.classList.add('hidden');
                cartToggle.classList.remove('hidden');

                alert(`Transaksi berhasil! Hutang ${customerName}: ${formatCurrency(debt)}`);
                displaySavedProducts(); // Refresh product display
                displayScannerProductTable(); // Refresh scanner table
            };
            showReceiptPreview(transaction);
            return;
        }

        // Transaction history
        function displayTransactionHistory() {
            const container = document.getElementById('transactionHistory');
            
            if (salesData.length === 0) {
                container.innerHTML = '<div class="text-center text-gray-500 py-8">Belum ada transaksi</div>';
                return;
            }

            const sortedTransactions = [...salesData].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

            container.innerHTML = `
                <div class="overflow-x-auto">
                    <table class="w-full bg-white border border-gray-200 rounded-lg">
                        <thead class="bg-gray-50">
                            <tr>
                                <th class="px-4 py-3 text-left font-semibold text-gray-700">ID Transaksi</th>
                                <th class="px-4 py-3 text-left font-semibold text-gray-700">Tanggal</th>
                                <th class="px-4 py-3 text-left font-semibold text-gray-700">Pelanggan</th>
                                <th class="px-4 py-3 text-left font-semibold text-gray-700">Item</th>
                                <th class="px-4 py-3 text-right font-semibold text-gray-700">Total</th>
                                <th class="px-4 py-3 text-right font-semibold text-gray-700">Bayar</th>
                                <th class="px-4 py-3 text-right font-semibold text-gray-700">Status</th>
                                <th class="px-4 py-3 text-center font-semibold text-gray-700">Aksi</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${sortedTransactions.map(transaction => {
                                const date = new Date(transaction.timestamp);
                                const isPartial = transaction.type === 'partial';
                                const isDebtPayment = transaction.type === 'debt_payment';
                                
                                if (isDebtPayment) {
                                    return `
                                        <tr class="border-b border-gray-100 hover:bg-blue-50">
                                            <td class="px-4 py-3 font-mono text-sm">${transaction.id}</td>
                                            <td class="px-4 py-3 text-sm">${date.toLocaleDateString('id-ID')}<br><span class="text-xs text-gray-500">${date.toLocaleTimeString('id-ID')}</span></td>
                                            <td class="px-4 py-3 text-sm font-semibold text-blue-600">${transaction.customerName}</td>
                                            <td class="px-4 py-3 text-sm text-blue-600">Pembayaran Hutang</td>
                                            <td class="px-4 py-3 text-right font-semibold text-blue-600">${formatCurrency(transaction.total ?? transaction.paid ?? transaction.amount ?? 0)}</td>
                                            <td class="px-4 py-3 text-right font-semibold text-blue-600">${formatCurrency(transaction.paid ?? transaction.total ?? transaction.amount ?? 0)}</td>
                                            <td class="px-4 py-3 text-right">
                                                <span class="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs font-semibold">
                                                    💰 Cicilan
                                                </span>
                                                ${((transaction.remainingDebt ?? transaction.debt) > 0) ? `<br><span class="text-xs text-red-600">Sisa: ${formatCurrency(transaction.remainingDebt ?? transaction.debt)}</span>` : '<br><span class="text-xs text-green-600">Lunas</span>'}
                                            </td>
                                            <td class="px-4 py-3 text-center">
                                                <button onclick="printDebtPaymentReceipt(${JSON.stringify(transaction).replace(/"/g, '&quot;')})" 
                                                        class="bg-purple-500 hover:bg-purple-600 text-white px-2 py-1 rounded text-xs">
                                                    🖨️
                                                </button>
                                            </td>
                                        </tr>
                                    `;
                                }
                                
                                return `
                                    <tr class="border-b border-gray-100 hover:bg-gray-50">
                                        <td class="px-4 py-3 font-mono text-sm">${transaction.id}</td>
                                        <td class="px-4 py-3 text-sm">${date.toLocaleDateString('id-ID')}<br><span class="text-xs text-gray-500">${date.toLocaleTimeString('id-ID')}</span></td>
                                        <td class="px-4 py-3 text-sm ${isPartial ? 'font-semibold text-orange-600' : 'text-gray-500'}">
                                            ${isPartial ? transaction.customerName : 'Umum'}
                                        </td>
                                        <td class="px-4 py-3 text-sm">
                                            <div class="max-w-xs">
                                                ${transaction.items ? transaction.items.map(item => `${item.name} (${item.quantity}x)`).join(', ') : 'N/A'}
                                            </div>
                                            <div class="text-xs text-gray-500 mt-1">${transaction.items ? transaction.items.length : 0} item(s)</div>
                                        </td>
                                        <td class="px-4 py-3 text-right font-semibold ${isPartial ? 'text-orange-600' : 'text-green-600'}">
                                            ${formatCurrency(transaction.total || 0)}
                                        </td>
                                        <td class="px-4 py-3 text-right font-semibold text-blue-600">
                                            ${formatCurrency(transaction.paid || 0)}
                                        </td>
                                        <td class="px-4 py-3 text-right">
                                            ${isPartial ? 
                                                `<span class="bg-orange-100 text-orange-800 px-2 py-1 rounded-full text-xs font-semibold">💳 Hutang</span><br><span class="text-xs text-red-600">Sisa: ${formatCurrency(transaction.debt || 0)}</span>` :
                                                `<span class="bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs font-semibold">✅ Lunas</span><br><span class="text-xs text-green-600">Kembalian: ${formatCurrency(transaction.change || 0)}</span>`
                                            }
                                        </td>
                                        <td class="px-4 py-3 text-center">
                                            <button onclick="printThermalReceipt(${JSON.stringify(transaction).replace(/"/g, '&quot;')})" 
                                                    class="bg-purple-500 hover:bg-purple-600 text-white px-2 py-1 rounded text-xs">
                                                🖨️
                                            </button>
                                        </td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        }

        function filterTransactionHistory() {
            const filter = document.getElementById('historyFilter').value;
            const now = new Date();
            let filtered = [...salesData];

            switch (filter) {
                case 'today':
                    filtered = salesData.filter(t => {
                        const transactionDate = new Date(t.timestamp);
                        return transactionDate.toDateString() === now.toDateString();
                    });
                    break;
                case 'week':
                    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                    filtered = salesData.filter(t => new Date(t.timestamp) >= weekAgo);
                    break;
                case 'month':
                    const monthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
                    filtered = salesData.filter(t => new Date(t.timestamp) >= monthAgo);
                    break;
                case 'full':
                    filtered = salesData.filter(t => t.type === 'full');
                    break;
                case 'partial':
                    filtered = salesData.filter(t => t.type === 'partial');
                    break;
            }

            const container = document.getElementById('transactionHistory');
            
            if (filtered.length === 0) {
                container.innerHTML = '<div class="text-center text-gray-500 py-8">Tidak ada transaksi ditemukan</div>';
                return;
            }

            const sortedTransactions = filtered.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

            container.innerHTML = `
                <div class="overflow-x-auto">
                    <table class="w-full bg-white border border-gray-200 rounded-lg">
                        <thead class="bg-gray-50">
                            <tr>
                                <th class="px-4 py-3 text-left font-semibold text-gray-700">ID Transaksi</th>
                                <th class="px-4 py-3 text-left font-semibold text-gray-700">Tanggal</th>
                                <th class="px-4 py-3 text-left font-semibold text-gray-700">Pelanggan</th>
                                <th class="px-4 py-3 text-left font-semibold text-gray-700">Item</th>
                                <th class="px-4 py-3 text-right font-semibold text-gray-700">Total</th>
                                <th class="px-4 py-3 text-right font-semibold text-gray-700">Bayar</th>
                                <th class="px-4 py-3 text-right font-semibold text-gray-700">Status</th>
                                <th class="px-4 py-3 text-center font-semibold text-gray-700">Aksi</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${sortedTransactions.map(transaction => {
                                const date = new Date(transaction.timestamp);
                                const isPartial = transaction.type === 'partial';
                                const isDebtPayment = transaction.type === 'debt_payment';
                                
                                if (isDebtPayment) {
                                    return `
                                        <tr class="border-b border-gray-100 hover:bg-blue-50">
                                            <td class="px-4 py-3 font-mono text-sm">${transaction.id}</td>
                                            <td class="px-4 py-3 text-sm">${date.toLocaleDateString('id-ID')}<br><span class="text-xs text-gray-500">${date.toLocaleTimeString('id-ID')}</span></td>
                                            <td class="px-4 py-3 text-sm font-semibold text-blue-600">${transaction.customerName}</td>
                                            <td class="px-4 py-3 text-sm text-blue-600">Pembayaran Hutang</td>
                                            <td class="px-4 py-3 text-right font-semibold text-blue-600">${formatCurrency(transaction.total ?? transaction.paid ?? transaction.amount ?? 0)}</td>
                                            <td class="px-4 py-3 text-right font-semibold text-blue-600">${formatCurrency(transaction.paid ?? transaction.total ?? transaction.amount ?? 0)}</td>
                                            <td class="px-4 py-3 text-right">
                                                <span class="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs font-semibold">
                                                    💰 Cicilan
                                                </span>
                                                ${((transaction.remainingDebt ?? transaction.debt) > 0) ? `<br><span class="text-xs text-red-600">Sisa: ${formatCurrency(transaction.remainingDebt ?? transaction.debt)}</span>` : '<br><span class="text-xs text-green-600">Lunas</span>'}
                                            </td>
                                            <td class="px-4 py-3 text-center">
                                                <button onclick="printDebtPaymentReceipt(${JSON.stringify(transaction).replace(/"/g, '&quot;')})" 
                                                        class="bg-purple-500 hover:bg-purple-600 text-white px-2 py-1 rounded text-xs">
                                                    🖨️
                                                </button>
                                            </td>
                                        </tr>
                                    `;
                                }
                                
                                return `
                                    <tr class="border-b border-gray-100 hover:bg-gray-50">
                                        <td class="px-4 py-3 font-mono text-sm">${transaction.id}</td>
                                        <td class="px-4 py-3 text-sm">${date.toLocaleDateString('id-ID')}<br><span class="text-xs text-gray-500">${date.toLocaleTimeString('id-ID')}</span></td>
                                        <td class="px-4 py-3 text-sm ${isPartial ? 'font-semibold text-orange-600' : 'text-gray-500'}">
                                            ${isPartial ? transaction.customerName : 'Umum'}
                                        </td>
                                        <td class="px-4 py-3 text-sm">
                                            <div class="max-w-xs">
                                                ${transaction.items ? transaction.items.map(item => `${item.name} (${item.quantity}x)`).join(', ') : 'N/A'}
                                            </div>
                                            <div class="text-xs text-gray-500 mt-1">${transaction.items ? transaction.items.length : 0} item(s)</div>
                                        </td>
                                        <td class="px-4 py-3 text-right font-semibold ${isPartial ? 'text-orange-600' : 'text-green-600'}">
                                            ${formatCurrency(transaction.total || 0)}
                                        </td>
                                        <td class="px-4 py-3 text-right font-semibold text-blue-600">
                                            ${formatCurrency(transaction.paid || 0)}
                                        </td>
                                        <td class="px-4 py-3 text-right">
                                            ${isPartial ? 
                                                `<span class="bg-orange-100 text-orange-800 px-2 py-1 rounded-full text-xs font-semibold">💳 Hutang</span><br><span class="text-xs text-red-600">Sisa: ${formatCurrency(transaction.debt || 0)}</span>` :
                                                `<span class="bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs font-semibold">✅ Lunas</span><br><span class="text-xs text-green-600">Kembalian: ${formatCurrency(transaction.change || 0)}</span>`
                                            }
                                        </td>
                                        <td class="px-4 py-3 text-center">
                                            <button onclick="printThermalReceipt(${JSON.stringify(transaction).replace(/"/g, '&quot;')})" 
                                                    class="bg-purple-500 hover:bg-purple-600 text-white px-2 py-1 rounded text-xs">
                                                🖨️
                                            </button>
                                        </td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        }

        function searchTransactionHistory(searchTerm) {
            if (!searchTerm.trim()) {
                displayTransactionHistory();
                return;
            }

            const filtered = salesData.filter(transaction => 
                transaction.id.toString().includes(searchTerm) ||
                (transaction.customerName && transaction.customerName.toLowerCase().includes(searchTerm.toLowerCase())) ||
                (transaction.items && transaction.items.some(item => item.name.toLowerCase().includes(searchTerm.toLowerCase())))
            );

            const container = document.getElementById('transactionHistory');
            
            if (filtered.length === 0) {
                container.innerHTML = '<div class="text-center text-gray-500 py-8">Tidak ada transaksi ditemukan</div>';
                return;
            }

            const sortedTransactions = filtered.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

            container.innerHTML = `
                <div class="overflow-x-auto">
                    <table class="w-full bg-white border border-gray-200 rounded-lg">
                        <thead class="bg-gray-50">
                            <tr>
                                <th class="px-4 py-3 text-left font-semibold text-gray-700">ID Transaksi</th>
                                <th class="px-4 py-3 text-left font-semibold text-gray-700">Tanggal</th>
                                <th class="px-4 py-3 text-left font-semibold text-gray-700">Pelanggan</th>
                                <th class="px-4 py-3 text-left font-semibold text-gray-700">Item</th>
                                <th class="px-4 py-3 text-right font-semibold text-gray-700">Total</th>
                                <th class="px-4 py-3 text-right font-semibold text-gray-700">Bayar</th>
                                <th class="px-4 py-3 text-right font-semibold text-gray-700">Status</th>
                                <th class="px-4 py-3 text-center font-semibold text-gray-700">Aksi</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${sortedTransactions.map(transaction => {
                                const date = new Date(transaction.timestamp);
                                const isPartial = transaction.type === 'partial';
                                const isDebtPayment = transaction.type === 'debt_payment';
                                
                                if (isDebtPayment) {
                                    return `
                                        <tr class="border-b border-gray-100 hover:bg-blue-50">
                                            <td class="px-4 py-3 font-mono text-sm">${transaction.id}</td>
                                            <td class="px-4 py-3 text-sm">${date.toLocaleDateString('id-ID')}<br><span class="text-xs text-gray-500">${date.toLocaleTimeString('id-ID')}</span></td>
                                            <td class="px-4 py-3 text-sm font-semibold text-blue-600">${transaction.customerName}</td>
                                            <td class="px-4 py-3 text-sm text-blue-600">Pembayaran Hutang</td>
                                            <td class="px-4 py-3 text-right font-semibold text-blue-600">${formatCurrency(transaction.total ?? transaction.paid ?? transaction.amount ?? 0)}</td>
                                            <td class="px-4 py-3 text-right font-semibold text-blue-600">${formatCurrency(transaction.paid ?? transaction.total ?? transaction.amount ?? 0)}</td>
                                            <td class="px-4 py-3 text-right">
                                                <span class="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs font-semibold">
                                                    💰 Cicilan
                                                </span>
                                                ${((transaction.remainingDebt ?? transaction.debt) > 0) ? `<br><span class="text-xs text-red-600">Sisa: ${formatCurrency(transaction.remainingDebt ?? transaction.debt)}</span>` : '<br><span class="text-xs text-green-600">Lunas</span>'}
                                            </td>
                                            <td class="px-4 py-3 text-center">
                                                <button onclick="printDebtPaymentReceipt(${JSON.stringify(transaction).replace(/"/g, '&quot;')})" 
                                                        class="bg-purple-500 hover:bg-purple-600 text-white px-2 py-1 rounded text-xs">
                                                    🖨️
                                                </button>
                                            </td>
                                        </tr>
                                    `;
                                }
                                
                                return `
                                    <tr class="border-b border-gray-100 hover:bg-gray-50">
                                        <td class="px-4 py-3 font-mono text-sm">${transaction.id}</td>
                                        <td class="px-4 py-3 text-sm">${date.toLocaleDateString('id-ID')}<br><span class="text-xs text-gray-500">${date.toLocaleTimeString('id-ID')}</span></td>
                                        <td class="px-4 py-3 text-sm ${isPartial ? 'font-semibold text-orange-600' : 'text-gray-500'}">
                                            ${isPartial ? transaction.customerName : 'Umum'}
                                        </td>
                                        <td class="px-4 py-3 text-sm">
                                            <div class="max-w-xs">
                                                ${transaction.items ? transaction.items.map(item => `${item.name} (${item.quantity}x)`).join(', ') : 'N/A'}
                                            </div>
                                            <div class="text-xs text-gray-500 mt-1">${transaction.items ? transaction.items.length : 0} item(s)</div>
                                        </td>
                                        <td class="px-4 py-3 text-right font-semibold ${isPartial ? 'text-orange-600' : 'text-green-600'}">
                                            ${formatCurrency(transaction.total || 0)}
                                        </td>
                                        <td class="px-4 py-3 text-right font-semibold text-blue-600">
                                            ${formatCurrency(transaction.paid || 0)}
                                        </td>
                                        <td class="px-4 py-3 text-right">
                                            ${isPartial ? 
                                                `<span class="bg-orange-100 text-orange-800 px-2 py-1 rounded-full text-xs font-semibold">💳 Hutang</span><br><span class="text-xs text-red-600">Sisa: ${formatCurrency(transaction.debt || 0)}</span>` :
                                                `<span class="bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs font-semibold">✅ Lunas</span><br><span class="text-xs text-green-600">Kembalian: ${formatCurrency(transaction.change || 0)}</span>`
                                            }
                                        </td>
                                        <td class="px-4 py-3 text-center">
                                            <button onclick="printThermalReceipt(${JSON.stringify(transaction).replace(/"/g, '&quot;')})" 
                                                    class="bg-purple-500 hover:bg-purple-600 text-white px-2 py-1 rounded text-xs">
                                                🖨️
                                            </button>
                                        </td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        }

        // Analysis functions
        function updateAnalysis() {
            const today = new Date();
            const todayTransactions = salesData.filter(t => {
                if (!t.timestamp) return false;
                const transactionDate = new Date(t.timestamp);
                return transactionDate.toDateString() === today.toDateString();
            });

            let totalRevenue = 0;
            let totalModal = 0;
            let transactionCount = 0;

            todayTransactions.forEach(transaction => {
                if (transaction.total && !isNaN(transaction.total)) {
                    totalRevenue += transaction.total;
                    transactionCount++;
                }
                
                if (transaction.items && Array.isArray(transaction.items)) {
                    transaction.items.forEach(item => {
                        // Determine modal/cost price: prefer per-item modalPrice (for services), else fall back to product modalPrice
                        let costPrice = 0;
                        if (item.modalPrice && !isNaN(item.modalPrice)) {
                            costPrice = item.modalPrice;
                        } else {
                            const product = products.find(p => p.id === item.id);
                            if (product && product.modalPrice && !isNaN(product.modalPrice)) {
                                costPrice = product.modalPrice;
                            }
                        }
                        if (!isNaN(costPrice) && costPrice >= 0 && item.quantity && !isNaN(item.quantity)) {
                            totalModal += costPrice * item.quantity;
                        }
                    });
                }
            });

            const grossProfit = totalRevenue - totalModal;
            const profitMargin = totalRevenue > 0 ? (grossProfit / totalRevenue * 100) : 0;
            const roi = totalModal > 0 ? (grossProfit / totalModal * 100) : 0;

            document.getElementById('totalRevenue').textContent = formatCurrency(totalRevenue);
            document.getElementById('revenueCount').textContent = `${transactionCount} transaksi`;
            document.getElementById('totalModal').textContent = formatCurrency(totalModal);
            document.getElementById('grossProfit').textContent = formatCurrency(grossProfit);
            document.getElementById('profitMargin').textContent = `${profitMargin.toFixed(1)}% margin`;
            document.getElementById('roi').textContent = `${roi.toFixed(1)}%`;

            updateProductAnalysisTable(todayTransactions);
        }

        function updateProductAnalysisTable(transactions) {
            const productStats = {};

            transactions.forEach(transaction => {
                if (transaction.items && Array.isArray(transaction.items)) {
                    transaction.items.forEach(item => {
                        if (!item.id || !item.name || !item.price || !item.quantity) return;
                        
                        // Determine cost price for this item (either per-item modalPrice for services or product.modalPrice)
                        const product = products.find(p => p.id === item.id);
                        const costPrice = (item.modalPrice && !isNaN(item.modalPrice)) ? item.modalPrice :
                                          (product && product.modalPrice && !isNaN(product.modalPrice)) ? product.modalPrice : 0;

                        if (!productStats[item.id]) {
                            productStats[item.id] = {
                                name: item.name,
                                sold: 0,
                                revenue: 0,
                                modal: 0,
                                modalPrice: costPrice
                            };
                        }

                        if (!isNaN(item.quantity) && !isNaN(item.price)) {
                            productStats[item.id].sold += item.quantity;
                            productStats[item.id].revenue += item.price * item.quantity;
                            productStats[item.id].modal += costPrice * item.quantity;
                        }
                    });
                }
            });

            const tableBody = document.getElementById('productAnalysisTable');
            
            if (Object.keys(productStats).length === 0) {
                tableBody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-gray-500">Belum ada data penjualan</td></tr>';
                return;
            }

            tableBody.innerHTML = Object.values(productStats).map(stat => {
                const profit = stat.revenue - stat.modal;
                const margin = stat.revenue > 0 ? (profit / stat.revenue * 100) : 0;
                const marginClass = margin > 50 ? 'text-green-600' : margin > 25 ? 'text-yellow-600' : 'text-red-600';
                
                return `
                    <tr class="border-b border-gray-100">
                        <td class="px-4 py-3 font-medium">${stat.name}</td>
                        <td class="px-4 py-3 text-right">${stat.sold}</td>
                        <td class="px-4 py-3 text-right font-semibold text-green-600">${formatCurrency(stat.revenue)}</td>
                        <td class="px-4 py-3 text-right text-red-600">${formatCurrency(stat.modal)}</td>
                        <td class="px-4 py-3 text-right font-semibold text-blue-600">${formatCurrency(profit)}</td>
                        <td class="px-4 py-3 text-right font-semibold ${marginClass}">${margin.toFixed(1)}%</td>
                    </tr>
                `;
            }).join('');
        }

        function filterAnalysis(period) {
            // Update button styles
            ['filterToday', 'filterWeek', 'filterMonth', 'filterAll'].forEach(id => {
                const btn = document.getElementById(id);
                btn.classList.remove('bg-green-500', 'text-white');
                btn.classList.add('bg-gray-300', 'text-gray-700');
            });
            
            document.getElementById('filter' + period.charAt(0).toUpperCase() + period.slice(1)).classList.remove('bg-gray-300', 'text-gray-700');
            document.getElementById('filter' + period.charAt(0).toUpperCase() + period.slice(1)).classList.add('bg-green-500', 'text-white');

            const now = new Date();
            let filteredTransactions = [];

            switch (period) {
                case 'today':
                    filteredTransactions = salesData.filter(t => {
                        const transactionDate = new Date(t.timestamp);
                        return transactionDate.toDateString() === now.toDateString();
                    });
                    break;
                case 'week':
                    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                    filteredTransactions = salesData.filter(t => new Date(t.timestamp) >= weekAgo);
                    break;
                case 'month':
                    const monthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
                    filteredTransactions = salesData.filter(t => new Date(t.timestamp) >= monthAgo);
                    break;
                case 'all':
                    filteredTransactions = [...salesData];
                    break;
            }

            let totalRevenue = 0;
            let totalModal = 0;
            let transactionCount = filteredTransactions.length;

            filteredTransactions.forEach(transaction => {
                if (transaction.total && !isNaN(transaction.total)) {
                    totalRevenue += transaction.total;
                }
                
                if (transaction.items && Array.isArray(transaction.items)) {
                    transaction.items.forEach(item => {
                        // Determine modal/cost price: prefer per-item modalPrice (for services), else fall back to product modalPrice
                        let costPrice = 0;
                        if (item.modalPrice && !isNaN(item.modalPrice)) {
                            costPrice = item.modalPrice;
                        } else {
                            const product = products.find(p => p.id === item.id);
                            if (product && product.modalPrice && !isNaN(product.modalPrice)) {
                                costPrice = product.modalPrice;
                            }
                        }
                        if (!isNaN(costPrice) && costPrice >= 0 && item.quantity && !isNaN(item.quantity)) {
                            totalModal += costPrice * item.quantity;
                        }
                    });
                }
            });

            const grossProfit = totalRevenue - totalModal;
            const profitMargin = totalRevenue > 0 ? (grossProfit / totalRevenue * 100) : 0;
            const roi = totalModal > 0 ? (grossProfit / totalModal * 100) : 0;

            document.getElementById('totalRevenue').textContent = formatCurrency(totalRevenue);
            document.getElementById('revenueCount').textContent = `${transactionCount} transaksi`;
            document.getElementById('totalModal').textContent = formatCurrency(totalModal);
            document.getElementById('grossProfit').textContent = formatCurrency(grossProfit);
            document.getElementById('profitMargin').textContent = `${profitMargin.toFixed(1)}% margin`;
            document.getElementById('roi').textContent = `${roi.toFixed(1)}%`;

            updateProductAnalysisTable(filteredTransactions);
        }

        // Reports
        function showReports() {
            const today = new Date();
            const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
            const monthAgo = new Date(today.getFullYear(), today.getMonth() - 1, today.getDate());

            // Daily report
            const dailyTransactions = salesData.filter(t => {
                if (!t.timestamp) return false;
                const transactionDate = new Date(t.timestamp);
                return transactionDate.toDateString() === today.toDateString();
            });
            const dailyTotal = dailyTransactions.reduce((sum, t) => sum + (t.total || 0), 0);

            // Weekly report
            const weeklyTransactions = salesData.filter(t => {
                if (!t.timestamp) return false;
                return new Date(t.timestamp) >= weekAgo;
            });
            const weeklyTotal = weeklyTransactions.reduce((sum, t) => sum + (t.total || 0), 0);

            // Monthly report
            const monthlyTransactions = salesData.filter(t => {
                if (!t.timestamp) return false;
                return new Date(t.timestamp) >= monthAgo;
            });
            const monthlyTotal = monthlyTransactions.reduce((sum, t) => sum + (t.total || 0), 0);

            document.getElementById('dailyTotal').textContent = formatCurrency(dailyTotal);
            document.getElementById('dailyTransactions').textContent = `${dailyTransactions.length} transaksi`;
            document.getElementById('weeklyTotal').textContent = formatCurrency(weeklyTotal);
            document.getElementById('weeklyTransactions').textContent = `${weeklyTransactions.length} transaksi`;
            document.getElementById('monthlyTotal').textContent = formatCurrency(monthlyTotal);
            document.getElementById('monthlyTransactions').textContent = `${monthlyTransactions.length} transaksi`;

            // Debt list
            const debtListContainer = document.getElementById('debtList');
            if (debtData.length === 0) {
                debtListContainer.innerHTML = '<div class="text-center text-gray-500 py-4">Tidak ada hutang pelanggan</div>';
            } else {
                debtListContainer.innerHTML = debtData.map((debt, index) => `
                    <div class="bg-white p-3 rounded border">
                        <div class="flex justify-between items-center mb-2">
                            <div class="font-semibold text-gray-800">${debt.customerName}</div>
                            <div class="font-bold text-red-600">${formatCurrency(debt.amount)}</div>
                        </div>
                        <div class="text-sm text-gray-600 mb-3">${debt.transactions.length} transaksi hutang</div>
                        <div class="flex space-x-2">
                            <button onclick="payOffDebt('${debt.customerName}', ${debt.amount})" 
                                    class="flex-1 bg-green-500 hover:bg-green-600 text-white py-1 px-3 rounded text-sm font-semibold">
                                💳 Lunasi
                            </button>
                            <button onclick="showDebtPaymentModal('${debt.customerName}', ${debt.amount})" 
                                    class="flex-1 bg-blue-500 hover:bg-blue-600 text-white py-1 px-3 rounded text-sm font-semibold">
                                💰 Cicil
                            </button>
                        </div>
                    </div>
                `).join('');
            }

            // Stock report
            const stockReportContainer = document.getElementById('stockReport');
            const outOfStock = products.filter(p => p.stock === 0);
            const lowStock = products.filter(p => p.stock > 0 && p.stock <= p.minStock);
            
            let stockReportHTML = '';
            
            if (outOfStock.length > 0) {
                stockReportHTML += `
                    <div class="mb-4">
                        <h5 class="font-semibold text-red-700 mb-2">🚫 Stok Habis (${outOfStock.length} produk)</h5>
                        <div class="space-y-1">
                            ${outOfStock.map(product => `
                                <div class="bg-red-100 p-2 rounded text-sm">
                                    <div class="font-medium text-red-800">${product.name}</div>
                                    <div class="text-red-600 text-xs">Stok: ${product.stock} | Min: ${product.minStock}</div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
            }
            
            if (lowStock.length > 0) {
                stockReportHTML += `
                    <div class="mb-4">
                        <h5 class="font-semibold text-yellow-700 mb-2">⚠️ Stok Menipis (${lowStock.length} produk)</h5>
                        <div class="space-y-1">
                            ${lowStock.map(product => `
                                <div class="bg-yellow-100 p-2 rounded text-sm">
                                    <div class="font-medium text-yellow-800">${product.name}</div>
                                    <div class="text-yellow-600 text-xs">Stok: ${product.stock} | Min: ${product.minStock}</div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
            }
            
            if (outOfStock.length === 0 && lowStock.length === 0) {
                stockReportHTML = '<div class="text-center text-gray-500 py-4">Semua produk stok aman ✅</div>';
            }
            
            stockReportContainer.innerHTML = stockReportHTML;

            document.getElementById('reportsModal').classList.remove('hidden');
            document.getElementById('reportsModal').classList.add('flex');
        }

        function closeReportsModal() {
            document.getElementById('reportsModal').classList.add('hidden');
            document.getElementById('reportsModal').classList.remove('flex');
        }

        // Debt payment functions
        let currentDebtCustomer = '';
        let currentDebtAmount = 0;

        function payOffDebt(customerName, amount) {
            const confirmMessage = `Yakin ingin melunasi hutang ${customerName} sebesar ${formatCurrency(amount)}?`;
            showConfirmLayer(confirmMessage, function(confirmed) {
                if (!confirmed) return;
                // Remove debt from debtData
                const debtIndex = debtData.findIndex(d => d.customerName === customerName);
                if (debtIndex !== -1) {
                    debtData.splice(debtIndex, 1);
                    saveData();
                    // Create payment record
                    const paymentRecord = {
                        id: Date.now(),
                        customerName: customerName,
                        amount: amount,
                        type: 'debt_payment',
                        timestamp: new Date().toISOString(),
                        total: amount,
                        paid: amount,
                        debt: 0,
                        remainingDebt: 0
                    };
                    salesData.push(paymentRecord);
                    saveData();
                    alert(`Hutang ${customerName} sebesar ${formatCurrency(amount)} telah dilunasi!`);
                    showReports(); // Refresh the reports modal
                    // Synchronize deletion of the debt and the new payment record to Google Sheets
                    try {
                        // Remove the debt row
                        sendDeltaToGoogleSheets('delete', 'debts', customerName).catch(err => {
                            console.error('Auto sync failed:', err);
                        });
                        // Add the payment record as a sale
                        sendDeltaToGoogleSheets('add', 'sales', saleToRow(paymentRecord)).catch(err => {
                            console.error('Auto sync failed:', err);
                        });
                    } catch (err) {
                        console.error('Auto sync failed:', err);
                    }
                }
            });
        }

        function showDebtPaymentModal(customerName, amount) {
            currentDebtCustomer = customerName;
            currentDebtAmount = amount;
            
            document.getElementById('debtCustomerName').textContent = customerName;
            document.getElementById('debtTotalAmount').textContent = formatCurrency(amount);
            document.getElementById('debtPaymentAmount').value = '';
            document.getElementById('debtRemainingAmount').textContent = formatCurrency(amount);
            
            const modal = document.getElementById('debtPaymentModal');
            modal.classList.remove('hidden');
            modal.style.display = 'block';
            
            setTimeout(() => document.getElementById('debtPaymentAmount').focus(), 100);
        }

        function closeDebtPaymentModal() {
            const modal = document.getElementById('debtPaymentModal');
            modal.classList.add('hidden');
            modal.style.display = 'none';
            currentDebtCustomer = '';
            currentDebtAmount = 0;
        }

        function calculateDebtRemaining() {
            const paymentAmount = parseInt(document.getElementById('debtPaymentAmount').value) || 0;
            const remaining = currentDebtAmount - paymentAmount;
            
            const debtRemainingContainer = document.getElementById('debtRemainingContainer');
            const debtRemainingLabel = document.getElementById('debtRemainingLabel');
            const debtRemainingAmount = document.getElementById('debtRemainingAmount');
            const debtRemainingStatus = document.getElementById('debtRemainingStatus');
            
            if (paymentAmount === 0) {
                // No payment entered
                debtRemainingContainer.className = 'bg-gray-50 p-4 rounded-lg';
                debtRemainingLabel.textContent = 'Sisa hutang setelah bayar:';
                debtRemainingAmount.textContent = formatCurrency(currentDebtAmount);
                debtRemainingAmount.className = 'text-xl font-bold text-gray-600';
                debtRemainingStatus.textContent = '';
            } else if (paymentAmount > currentDebtAmount) {
                // Overpayment
                const overpayment = paymentAmount - currentDebtAmount;
                debtRemainingContainer.className = 'bg-red-50 p-4 rounded-lg';
                debtRemainingLabel.textContent = 'Kelebihan bayar:';
                debtRemainingAmount.textContent = formatCurrency(overpayment);
                debtRemainingAmount.className = 'text-xl font-bold text-red-600';
                debtRemainingStatus.textContent = '⚠️ Jumlah bayar melebihi total hutang';
                debtRemainingStatus.className = 'text-xs mt-1 text-red-600 font-medium';
            } else if (paymentAmount === currentDebtAmount) {
                // Full payment
                debtRemainingContainer.className = 'bg-green-50 p-4 rounded-lg';
                debtRemainingLabel.textContent = 'Status:';
                debtRemainingAmount.textContent = 'LUNAS! ✅';
                debtRemainingAmount.className = 'text-xl font-bold text-green-600';
                debtRemainingStatus.textContent = '🎉 Hutang akan terlunasi sepenuhnya';
                debtRemainingStatus.className = 'text-xs mt-1 text-green-600 font-medium';
            } else {
                // Partial payment
                const percentage = ((paymentAmount / currentDebtAmount) * 100).toFixed(1);
                debtRemainingContainer.className = 'bg-blue-50 p-4 rounded-lg';
                debtRemainingLabel.textContent = 'Sisa hutang:';
                debtRemainingAmount.textContent = formatCurrency(remaining);
                debtRemainingAmount.className = 'text-xl font-bold text-blue-600';
                debtRemainingStatus.textContent = `💳 Cicilan ${percentage}% dari total hutang`;
                debtRemainingStatus.className = 'text-xs mt-1 text-blue-600 font-medium';
            }
        }

        function processDebtPayment() {
            const paymentAmount = parseInt(document.getElementById('debtPaymentAmount').value) || 0;
            
            if (paymentAmount <= 0) {
                alert('Jumlah bayar harus lebih dari 0!');
                return;
            }
            
            if (paymentAmount > currentDebtAmount) {
                alert('Jumlah bayar tidak boleh lebih dari total hutang!');
                return;
            }
            
            // Find and update debt
            const debtIndex = debtData.findIndex(d => d.customerName === currentDebtCustomer);
            if (debtIndex !== -1) {
                const remainingDebt = currentDebtAmount - paymentAmount;
                
                if (remainingDebt === 0) {
                    // Fully paid - remove debt
                    debtData.splice(debtIndex, 1);
                    alert(`Hutang ${currentDebtCustomer} telah lunas!`);
                } else {
                    // Partial payment - update debt amount
                    debtData[debtIndex].amount = remainingDebt;
                    debtData[debtIndex].transactions.push({
                        id: Date.now(),
                        amount: -paymentAmount, // Negative amount indicates payment
                        date: new Date().toLocaleDateString('id-ID'),
                        type: 'payment'
                    });
                    alert(`Pembayaran ${formatCurrency(paymentAmount)} berhasil! Sisa hutang: ${formatCurrency(remainingDebt)}`);
                }
                
                // Create payment record
                const paymentRecord = {
                    id: Date.now(),
                    customerName: currentDebtCustomer,
                    amount: paymentAmount,
                    remainingDebt: remainingDebt,
                    type: 'debt_payment',
                    timestamp: new Date().toISOString(),
                    // Populate total and paid for debt payment transactions so that history views do not render NaN.
                    total: paymentAmount,
                    paid: paymentAmount,
                    // Also set `debt` to the remaining balance.  When exported/imported, the debt column
                    // will map back to this property, ensuring the remaining debt is preserved.
                    debt: remainingDebt
                };
                
                salesData.push(paymentRecord);
                saveData();
                
                // Capture values needed for synchronization before resetting modal state
                const customerNameToSync = currentDebtCustomer;
                // Clone the updated debt record (if any) before we modify global state
                let debtRecordToSync = null;
                if (remainingDebt > 0 && debtIndex !== -1) {
                    debtRecordToSync = { ...debtData[debtIndex] };
                }
                // Close the modal and reset state variables
                closeDebtPaymentModal();
                showReports(); // Refresh the reports modal
                // Synchronize the debt payment with Google Sheets
                try {
                    // Add the payment record to Sales sheet
                    sendDeltaToGoogleSheets('add', 'sales', saleToRow(paymentRecord)).catch(err => console.error('Auto sync failed:', err));
                    if (remainingDebt === 0) {
                        // Debt is fully paid off: remove the debt row
                        sendDeltaToGoogleSheets('delete', 'debts', customerNameToSync).catch(err => console.error('Auto sync failed:', err));
                    } else {
                        // Partial payment: update the debt row with new balance and transactions
                        if (debtRecordToSync) {
                            sendDeltaToGoogleSheets('update', 'debts', debtToRow(debtRecordToSync)).catch(err => console.error('Auto sync failed:', err));
                        }
                    }
                } catch (err) {
                    console.error('Auto sync failed:', err);
                }
            }
        }

        // Thermal printer functions
        function connectThermalPrinter() {
            if ('serial' in navigator) {
                navigator.serial.requestPort()
                    .then(port => {
                        thermalPrinter = port;
                        return port.open({ baudRate: 9600 });
                    })
                    .then(() => {
                        printerConnected = true;
                        updatePrinterStatus('connected');
                        alert('Printer thermal berhasil terhubung!');
                    })
                    .catch(err => {
                        console.error('Error connecting to printer:', err);
                        alert('Gagal menghubungkan printer thermal. Pastikan printer sudah terhubung dan driver terinstall.');
                        updatePrinterStatus('disconnected');
                    });
            } else {
                alert('Browser tidak mendukung koneksi serial. Gunakan Chrome/Edge terbaru.');
            }
        }

        function updatePrinterStatus(status) {
            const statusElement = document.getElementById('printerStatus');
            statusElement.classList.remove('hidden');
            
            if (status === 'connected') {
                statusElement.textContent = '🖨️ Printer Terhubung';
                statusElement.className = 'printer-status printer-connected';
            } else {
                statusElement.textContent = '🖨️ Printer Terputus';
                statusElement.className = 'printer-status printer-disconnected';
            }
            
            setTimeout(() => {
                statusElement.classList.add('hidden');
            }, 3000);
        }

        function printThermalReceipt(transaction) {
            // Create receipt content
            const receiptContent = generateReceiptContent(transaction);
            
            if (printerConnected && thermalPrinter) {
                // Send to thermal printer
                sendToThermalPrinter(receiptContent);
            } else {
                // Fallback: print to browser
                printToBrowser(receiptContent);
            }
        }

        function generateReceiptContent(transaction) {
            const date = new Date(transaction.timestamp);
            const isPartial = transaction.type === 'partial';
            
            return `
                <!--
                    Receipt styles tuned for better readability on 58mm thermal printers.  The base
                    font-size has been increased and line-height loosened so text prints larger and
                    clearer on small paper.  Header fonts are also larger to stand out.  Adjust
                    these values if you use a different paper size or require different scaling.
                -->
                <div style="width: 300px; font-family: monospace; font-size: 14px; line-height: 1.3;">
                    <div style="text-align: center; margin-bottom: 10px;">
                        <div style="font-size: 20px; font-weight: bold;">TOKO BAROKAH</div>
                        <div style="font-size: 12px;">RT 02 Desa Pematang Gadung</div>
                        <div style="font-size: 12px;">================================</div>
                    </div>
                    
                    <div style="margin-bottom: 10px; font-size: 14px;">
                        <div>No: ${transaction.id}</div>
                        <div>Tanggal: ${date.toLocaleString('id-ID')}</div>
                        <div>Kasir: Admin</div>
                        ${isPartial ? `<div>Pelanggan: ${transaction.customerName}</div>` : ''}
                        <div>================================</div>
                    </div>
                    
                    <div style="margin-bottom: 10px; font-size: 14px;">
                        ${transaction.items.map(item => {
                            // Calculate per-item discount and net values for receipt display
                            const itemSubtotal = item.price * item.quantity;
                            let itemDiscount = 0;
                            if (item.discountType === 'percent') {
                                itemDiscount = itemSubtotal * (item.discountValue || 0) / 100;
                            } else {
                                itemDiscount = item.discountValue || 0;
                            }
                            if (itemDiscount > itemSubtotal) itemDiscount = itemSubtotal;
                            const itemNet = itemSubtotal - itemDiscount;
                            const discountLabel = item.discountValue && item.discountValue > 0 ?
                                (item.discountType === 'percent' ? ` (${item.discountValue}% off)` : ` (-${formatCurrency(item.discountValue)})`) : '';
                            return `
                            <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
                                <div style="flex: 1;">${item.name}${item.isService ? ' (JASA)' : ''}</div>
                            </div>
                            ${item.description ? `<div style="font-size: 10px; color: #666; margin-bottom: 2px;">\"${item.description}\"</div>` : ''}
                            <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                                <div>${item.quantity} x ${formatCurrency(item.price)}${discountLabel}</div>
                                <div>${formatCurrency(itemNet)}</div>
                            </div>
                            `;
                        }).join('')}
                        <div>================================</div>
                    </div>
                    
                    <div style="margin-bottom: 10px;">
                        <div style="display: flex; justify-content: space-between;">
                            <div>Subtotal:</div>
                            <div>${formatCurrency(transaction.subtotal)}</div>
                        </div>
                        ${
                            (transaction.discountAmount && transaction.discountAmount > 0) || (transaction.discount && transaction.discount > 0)
                            ? `
                            <div style="display: flex; justify-content: space-between;">
                                <div>Diskon${transaction.discountType === 'amount' ? '' : ' (' + (transaction.discountValue ?? transaction.discount) + '%)'}:</div>
                                <div>-${formatCurrency(transaction.discountAmount ?? (transaction.subtotal * transaction.discount / 100))}</div>
                            </div>
                            `
                            : ''
                        }
                        <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 18px;">
                            <div>TOTAL:</div>
                            <div>${formatCurrency(transaction.total)}</div>
                        </div>
                        <div style="display: flex; justify-content: space-between;">
                            <div>Bayar:</div>
                            <div>${formatCurrency(transaction.paid)}</div>
                        </div>
                        ${!isPartial ? `
                            <div style="display: flex; justify-content: space-between;">
                                <div>Kembalian:</div>
                                <div>${formatCurrency(transaction.change)}</div>
                            </div>
                        ` : `
                            <div style="display: flex; justify-content: space-between; color: red;">
                                <div>Sisa Hutang:</div>
                                <div>${formatCurrency(transaction.debt)}</div>
                            </div>
                        `}
                    </div>
                    
                    <div style="text-align: center; margin-top: 15px; font-size: 10px;">
                        <div>Terima kasih atas kunjungan Anda</div>
                        <div>Barang yang sudah dibeli tidak dapat dikembalikan</div>
                        <div style="margin-top: 10px;">================================</div>
                    </div>
                </div>
            `;
        }

        function sendToThermalPrinter(content) {
            // Convert HTML content to thermal printer commands
            // This is a simplified version - actual implementation would need proper ESC/POS commands
            const commands = convertToThermalCommands(content);
            
            if (thermalPrinter && thermalPrinter.writable) {
                const writer = thermalPrinter.writable.getWriter();
                writer.write(new TextEncoder().encode(commands))
                    .then(() => {
                        writer.releaseLock();
                        console.log('Receipt sent to thermal printer');
                    })
                    .catch(err => {
                        console.error('Error printing:', err);
                        writer.releaseLock();
                        // Fallback to browser print
                        printToBrowser(content);
                    });
            } else {
                printToBrowser(content);
            }
        }

        function convertToThermalCommands(htmlContent) {
            // Convert HTML to plain text for thermal printer
            // This is a basic conversion - real implementation would use ESC/POS commands
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = htmlContent;
            return tempDiv.textContent || tempDiv.innerText || '';
        }

        function printToBrowser(content) {
            const printArea = document.getElementById('printArea');
            printArea.innerHTML = content;
            printArea.classList.remove('hidden');
            
            setTimeout(() => {
                window.print();
                printArea.classList.add('hidden');
            }, 100);
        }

        function printDebtPaymentReceipt(transaction) {
            const receiptContent = `
                <!--
                    Adjusted styling for debt payment receipts to improve legibility on
                    small 58mm thermal printers.  Larger fonts and increased line
                    height make the printed text more readable.
                -->
                <div style="width: 300px; font-family: monospace; font-size: 14px; line-height: 1.3;">
                    <div style="text-align: center; margin-bottom: 10px;">
                        <div style="font-size: 20px; font-weight: bold;">TOKO BAROKAH</div>
                        <div style="font-size: 12px;">RT 02 Desa Pematang Gadung</div>
                        <div style="font-size: 12px;">================================</div>
                        <div style="font-size: 18px; font-weight: bold; margin-top: 5px;">BUKTI PEMBAYARAN HUTANG</div>
                    </div>
                    
                    <div style="margin-bottom: 10px; font-size: 14px;">
                        <div>No: ${transaction.id}</div>
                        <div>Tanggal: ${new Date(transaction.timestamp).toLocaleString('id-ID')}</div>
                        <div>Kasir: Admin</div>
                        <div>Pelanggan: ${transaction.customerName}</div>
                        <div>================================</div>
                    </div>
                    
                    <div style="margin-bottom: 10px; font-size: 14px;">
                        <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 18px;">
                            <div>PEMBAYARAN HUTANG:</div>
                            <div>${formatCurrency(transaction.total ?? transaction.paid ?? transaction.amount ?? 0)}</div>
                        </div>
                        ${((transaction.remainingDebt ?? transaction.debt) > 0) ? `
                            <div style="display: flex; justify-content: space-between; color: red;">
                                <div>Sisa Hutang:</div>
                                <div>${formatCurrency(transaction.remainingDebt ?? transaction.debt)}</div>
                            </div>
                        ` : `
                            <div style="display: flex; justify-content: space-between; color: green;">
                                <div>Status:</div>
                                <div>LUNAS</div>
                            </div>
                        `}
                    </div>
                    
                    <div style="text-align: center; margin-top: 15px; font-size: 12px;">
                        <div>Terima kasih atas pembayaran Anda</div>
                        <div style="margin-top: 10px;">================================</div>
                    </div>
                </div>
            `;
            
            printToBrowser(receiptContent);
        }

// ===================== Google Sheets Integration =====================
// These functions integrate the application with a Google Apps Script Web App.
// Set the constant GOOGLE_APPS_SCRIPT_URL (defined near the top of this file)
// to your own Web App URL. See google_apps_script_template.gs for the Apps
// Script code. The export/import functions below convert the application’s
// in-memory data structures (products, salesData, debtData) into plain
// arrays of values that can be stored in a spreadsheet, and vice versa.

/**
 * Export local data (products, sales, debts) to Google Sheets via Apps Script.
 * Converts objects into arrays of values matching the expected sheet columns.
 */
/*
 * Kirim data lokal (produk, penjualan, hutang) ke Google Sheets melalui
 * Apps Script. Permintaan menggunakan Content‑Type `text/plain` untuk
 * menghindari preflight CORS. Respons tidak dibaca karena browser
 * memblokirnya untuk domain berbeda, sehingga notifikasi hanya
 * memberitahu bahwa data telah dikirim.
 */
// Modified export function to support silent exports.
// When `silent` is true, the export will run quietly without showing loading
// indicators or alert popups.  When false (default), the user sees a loading
// overlay and an alert message on success or failure.
async function exportDataToGoogleSheets(silent = false) {
    if (!GOOGLE_APPS_SCRIPT_URL || GOOGLE_APPS_SCRIPT_URL.includes('PASTE')) {
        if (!silent) {
            alert('URL Google Apps Script belum diatur. Silakan ganti konstanta GOOGLE_APPS_SCRIPT_URL di script.js.');
        }
        return;
    }
    // Only show loading overlay when not running silently
    if (!silent) {
        showLoading('Mengekspor data...');
    }
    // Ubah objek produk menjadi array
    // Include wholesaleMinQty and wholesalePrice when exporting products.
    // Some products may not have wholesale settings; in that case we export empty strings
    // to maintain consistent column positions in the spreadsheet.
    const productsRows = products.map(p => [
        p.id,
        p.name,
        p.price,
        p.modalPrice,
        p.barcode,
        p.stock,
        p.minStock,
        p.wholesaleMinQty ?? '',
        p.wholesalePrice ?? ''
    ]);
    const salesRows = salesData.map(s => [
        s.id,
        JSON.stringify(s.items),
        s.subtotal,
        s.discount,
        s.total,
        s.paid ?? '',
        s.change ?? '',
        // Export the remaining debt.  Fallback to remainingDebt if debt is undefined to
        // support older transactions that used remainingDebt instead of debt.
        (s.debt ?? s.remainingDebt ?? ''),
        s.customerName ?? '',
        s.timestamp,
        s.type
    ]);
    const debtsRows = debtData.map(d => [
        d.customerName,
        d.amount,
        JSON.stringify(d.transactions)
    ]);
    const payload = {
        products: productsRows,
        sales: salesRows,
        debts: debtsRows
    };
    try {
        await fetch(GOOGLE_APPS_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload)
        });
        if (!silent) {
            alert('Data berhasil dikirim ke Google Sheets. Silakan periksa spreadsheet.');
        }
    } catch (error) {
        if (!silent) {
            alert('Ekspor data gagal: ' + error.message);
        } else {
            console.error('Silent export failed:', error);
        }
    } finally {
        // Hide the overlay only if it was shown
        if (!silent) {
            hideLoading();
        }
    }
}

        /**
         * Update the discount value for a specific item in the cart.
         * This function is called when the user changes the discount input
         * associated with an item in the cart UI.  It casts the value to
         * an integer and updates the item's discountValue, then refreshes
         * the cart display and totals.
         *
         * @param {string|number} itemId The ID of the cart item (string for service items)
         * @param {string|number} newDiscountValue The new discount value entered by the user
         */
        function updateItemDiscount(itemId, newDiscountValue) {
            const item = cart.find(i => String(i.id) === String(itemId));
            if (item) {
                const val = parseInt(newDiscountValue) || 0;
                item.discountValue = val;
                updateCartDisplay();
                updateTotal();
            }
        }

        /**
         * Update the discount type for a specific item in the cart.  The type can
         * be either 'percent' or 'amount'.  After updating, the cart display
         * and totals are refreshed.  This is used by the per-item discount
         * selector in the cart UI.
         *
         * @param {string|number} itemId The ID of the cart item
         * @param {string} newType The new discount type ('percent' or 'amount')
         */
        function updateItemDiscountType(itemId, newType) {
            const item = cart.find(i => String(i.id) === String(itemId));
            if (item) {
                item.discountType = newType;
                updateCartDisplay();
                updateTotal();
            }
        }

// Alias for backward compatibility: the client originally used an "export"
// operation to synchronise local data with the Google Sheets backend.  In
// practice this function performs a full update of the underlying sheets
// by clearing old rows and writing the current state (see the Apps Script
// implementation in code.gs).  To align with terminology that emphasises
// updating rather than exporting, we provide updateDataToGoogleSheets() as
// a wrapper around exportDataToGoogleSheets().  If you want to add more
// granular update behaviour (for example, sending only changed rows), you
// can implement that logic here and adjust your Apps Script accordingly.
async function updateDataToGoogleSheets(silent = false) {
    return exportDataToGoogleSheets(silent);
}

// -----------------------------------------------------------------------------
// Incremental synchronization helpers
//
// The functions below convert application objects into arrays of values that
// correspond to the columns in the Google Sheets. They are used by
// sendDeltaToGoogleSheets() to send only the changed record instead of
// rewriting the entire dataset. This reduces bandwidth and avoids race
// conditions when multiple devices are synchronizing simultaneously.

/**
 * Convert a product object into an array matching the Products sheet structure.
 * @param {Object} product
 * @returns {Array}
 */
function productToRow(product) {
    return [
        product.id,
        product.name,
        product.price,
        product.modalPrice,
        product.barcode,
        product.stock,
        product.minStock,
        product.wholesaleMinQty ?? '',
        product.wholesalePrice ?? ''
    ];
}

/**
 * Convert a sale/transaction object into an array matching the Sales sheet.
 * @param {Object} sale
 * @returns {Array}
 */
function saleToRow(sale) {
    return [
        sale.id,
        JSON.stringify(sale.items),
        sale.subtotal,
        sale.discount,
        sale.total,
        sale.paid ?? '',
        sale.change ?? '',
        (sale.debt ?? sale.remainingDebt ?? ''),
        sale.customerName ?? '',
        sale.timestamp,
        sale.type
    ];
}

/**
 * Convert a debt record into an array matching the Debts sheet structure.
 * @param {Object} debt
 * @returns {Array}
 */
function debtToRow(debt) {
    return [
        debt.customerName,
        debt.amount,
        JSON.stringify(debt.transactions)
    ];
}

/**
 * Send a single-row change to Google Sheets via the Apps Script. The payload
 * includes an action (add, update or delete), the object type (products,
 * sales, debts), and either a row array (for add/update) or an ID (for delete).
 * This function returns a promise and logs errors to the console if any.
 *
 * @param {string} action One of 'add', 'update' or 'delete'.
 * @param {string} objectType The object type ('products', 'sales', or 'debts').
 * @param {Array|number|string} rowOrId Array of values for add/update or ID for delete.
 */
async function sendDeltaToGoogleSheets(action, objectType, rowOrId) {
    if (!GOOGLE_APPS_SCRIPT_URL || GOOGLE_APPS_SCRIPT_URL.includes('PASTE')) {
        console.warn('URL Google Apps Script belum diatur. Perubahan tidak akan tersinkron.');
        return;
    }
    const payload = { action: action, objectType: objectType };
    if (action === 'delete') {
        payload.id = rowOrId;
    } else {
        payload.row = rowOrId;
    }
    try {
        /**
         * Use text/plain instead of application/json to avoid a CORS preflight
         * request.  Google Apps Script accepts plain text payloads and
         * JSON.parse() will still parse the body correctly.  A preflight
         * triggered by application/json would require explicit
         * Access-Control-Allow-Origin headers from the Apps Script, which are
         * not added by default and would cause a 405 error in the browser.
         */
        await fetch(GOOGLE_APPS_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload)
        });
    } catch (err) {
        console.error('Failed to sync change to Google Sheets:', err);
    }
}

/**
 * Import data from Google Sheets via Apps Script and update local data.
 * Parses arrays of values back into objects used by the application.
 */
/*
 * Ambil data dari Google Sheets melalui Apps Script menggunakan JSONP.
 * Metode ini menambahkan script tag dinamis ke halaman dengan parameter `callback`.
 * Apps Script akan memanggil fungsi callback di browser dengan data.
 */
async function importDataFromGoogleSheets() {
    if (!GOOGLE_APPS_SCRIPT_URL || GOOGLE_APPS_SCRIPT_URL.includes('PASTE')) {
        alert('URL Google Apps Script belum diatur. Silakan ganti konstanta GOOGLE_APPS_SCRIPT_URL di script.js.');
        return;
    }
    // Tampilkan indikator loading saat proses impor dimulai
    showLoading('Mengimpor data...');
    return new Promise((resolve, reject) => {
        const callbackName = 'importCallback_' + Date.now();
        window[callbackName] = function(data) {
            try {
                // Map products
                if (Array.isArray(data.products)) {
                    /**
                     * Parse a numeric field from the imported data.
                     * Some backends may serialize missing values as the string "null" or "undefined";
                     * convert those to null.  Also convert empty strings or undefined to null.
                     * Return null when parsing fails (e.g. NaN) so downstream UI logic
                     * treats the value as absent rather than a falsy number.
                     * @param {any} v
                     * @returns {number|null}
                     */
                    function parseOptionalNumber(v) {
                        if (v === undefined || v === null || v === '' || v === 'null' || v === 'undefined') {
                            return null;
                        }
                        const num = Number(v);
                        return Number.isNaN(num) ? null : num;
                    }
                    products = data.products.map(row => {
                        const product = {
                            id: parseInt(row[0]),
                            name: row[1],
                            price: Number(row[2]),
                            modalPrice: Number(row[3]),
                            barcode: row[4],
                            stock: Number(row[5]),
                            minStock: Number(row[6])
                        };
                        // Optional wholesale fields may be undefined when older data is imported.
                        // Use parseOptionalNumber to handle strings like "null" or "undefined".
                        product.wholesaleMinQty = parseOptionalNumber(row[7]);
                        product.wholesalePrice = parseOptionalNumber(row[8]);
                        return product;
                    });
                }
                // Map sales
                if (Array.isArray(data.sales)) {
                    salesData = data.sales.map(row => ({
                        id: Number(row[0]),
                        items: JSON.parse(row[1] || '[]'),
                        subtotal: Number(row[2]),
                        discount: Number(row[3]),
                        total: Number(row[4]),
                        paid: row[5] !== '' ? Number(row[5]) : undefined,
                        change: row[6] !== '' ? Number(row[6]) : undefined,
                        debt: row[7] !== '' ? Number(row[7]) : undefined,
                        customerName: row[8] || undefined,
                        timestamp: row[9],
                        type: row[10]
                    }));
                }
                // Map debts
                if (Array.isArray(data.debts)) {
                    debtData = data.debts.map(row => ({
                        customerName: row[0],
                        amount: Number(row[1]),
                        transactions: JSON.parse(row[2] || '[]')
                    }));
                }
                // Remove duplicate products before saving so the database and UI
                // don't accumulate identical entries.  This deduplication
                // compares product fields and keeps only the first occurrence of
                // each unique combination.  See `removeDuplicateProducts()` for
                // details.
                removeDuplicateProducts();
                saveData();
                // refresh UI
                displaySavedProducts();
                displayScannerProductTable();
                // Reattach event listeners to search inputs after the DOM may have been updated
                // The import process replaces the products array and triggers UI updates, which can cause
                // event listeners on inputs (e.g., barcode and product searches) to be lost.  Calling
                // attachSearchListeners() ensures search and suggestion functionality continues to work.
                attachSearchListeners();
                // Sembunyikan loading sebelum menampilkan pesan
                hideLoading();
                alert('Impor data berhasil.');
                resolve();
            } catch (err) {
                // Pastikan overlay disembunyikan jika terjadi error saat memproses data
                hideLoading();
                reject(err);
            } finally {
                delete window[callbackName];
            }
        };
        const script = document.createElement('script');
        script.src = GOOGLE_APPS_SCRIPT_URL + '?callback=' + callbackName;
        script.onerror = function() {
            // Sembunyikan overlay jika gagal memuat script
            hideLoading();
            delete window[callbackName];
            alert('Impor data gagal: Gagal memuat data dari Google Sheets.');
            reject(new Error('Impor data gagal'));
        };
        document.body.appendChild(script);
    });
}

// Ensure that key functions used by inline HTML attributes are globally
// accessible.  When functions are declared within this module scope they
// may not automatically become properties of the window object, which
// causes inline attributes like `oninput="searchProducts(...)"` or
// `onkeypress="handleBarcodeInput(event)"` to fail after certain
// operations (e.g. imports) that reload or replace portions of the DOM.
// Explicitly assign these functions to the window object so they remain
// callable from HTML event attributes regardless of module scoping or
// bundling transformations.
window.searchProducts = searchProducts;
window.showProductSuggestions = showProductSuggestions;
window.hideProductSuggestions = hideProductSuggestions;
window.selectProductFromSuggestion = selectProductFromSuggestion;
window.handleBarcodeInput = handleBarcodeInput;
window.searchScannerProducts = searchScannerProducts;
window.handleScannerTableSearch = handleScannerTableSearch;

// ----------------------------------------------------------
// Kamera Barcode Scanner (Mobile)
//
// Fitur ini memungkinkan pemindaian barcode menggunakan kamera pada perangkat
// seluler. Ketika fungsi ini diaktifkan, pengguna dapat memilih untuk
// memulai pemindaian via kamera atau menghentikannya. Hasil scan
// otomatis akan dimasukkan ke dalam kolom barcode dan produk akan
// ditambahkan ke keranjang bila ada kecocokan barcode.

/**
 * Deteksi apakah perangkat yang digunakan adalah ponsel atau tablet.
 * @returns {boolean}
 */
function isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

// Instance dari Html5Qrcode yang sedang aktif untuk pemindaian kamera.
let cameraScannerInstance = null;
// Flag indicating whether QuaggaJS is currently scanning.  When true,
// QuaggaJS has been initialized and is processing camera frames.  This flag
// prevents multiple concurrent scans and helps stop the scanner cleanly.
let quaggaScannerActive = false;

/**
 * Inisialisasi tampilan dan event handler untuk pemindai kamera di perangkat mobile.
 * Menampilkan tombol pemindaian jika perangkat adalah mobile dan library
 * Html5Qrcode tersedia. Jika library belum dimuat (misal offline), maka
 * tombol akan tetap tersembunyi.
 */
function initializeMobileScanner() {
    // Pemindaian kamera di ponsel telah dinonaktifkan.  Fungsi ini dibiarkan
    // kosong agar opsi kamera tidak ditampilkan dan event handler tidak
    // didaftarkan.  USB/Bluetooth barcode scanner tetap berfungsi melalui
    // pemindai global.
    return;
}

/**
 * Memulai pemindaian barcode menggunakan kamera. Fungsi ini akan meminta izin
 * kamera, menampilkan stream di dalam elemen dengan id "cameraScanner", dan
 * memproses hasil scan. Jika pemindaian berhasil, barcode otomatis
 * dimasukkan ke input barcode dan produk akan ditambahkan ke keranjang.
 */
async function startCameraScan() {
    const startBtn = document.getElementById('startCameraScanButton');
    const stopBtn = document.getElementById('stopCameraScanButton');
    const scannerDiv = document.getElementById('cameraScanner');
    if (!startBtn || !stopBtn || !scannerDiv) return;

    // Jika scanner sudah aktif, jangan memulai lagi.
    if (cameraScannerInstance || quaggaScannerActive) {
        return;
    }

    // If neither library is available, abort early and inform the user.
    if (typeof Quagga === 'undefined' && typeof Html5Qrcode === 'undefined') {
        alert('Fitur scan kamera tidak tersedia. Pastikan koneksi internet atau library disertakan.');
        return;
    }

    // Tampilkan container dan tombol stop, sembunyikan tombol start
    scannerDiv.classList.remove('hidden');
    stopBtn.classList.remove('hidden');
    startBtn.classList.add('hidden');

    try {
        // Prefer using QuaggaJS for 1D barcode scanning if available.  Quagga
        // provides better decoding for linear barcodes such as EAN, UPC, and Code
        // series.  If initialization fails for any reason, fall back to
        // html5-qrcode.
        if (typeof Quagga !== 'undefined') {
            await startQuaggaScan(scannerDiv);
            return;
        }
        // If Quagga is not available, use html5-qrcode (as loaded from CDN).
        if (typeof Html5Qrcode !== 'undefined') {
            cameraScannerInstance = new Html5Qrcode('cameraScanner');
            const config = {
                fps: 10,
                rememberLastUsedCamera: true,
                useBarCodeDetectorIfSupported: true,
                formatsToSupport: [
                    Html5QrcodeSupportedFormats.CODE_128,
                    Html5QrcodeSupportedFormats.CODE_39,
                    Html5QrcodeSupportedFormats.CODE_93,
                    Html5QrcodeSupportedFormats.EAN_13,
                    Html5QrcodeSupportedFormats.EAN_8,
                    Html5QrcodeSupportedFormats.UPC_A,
                    Html5QrcodeSupportedFormats.UPC_E,
                    Html5QrcodeSupportedFormats.QR_CODE
                ]
            };
            await cameraScannerInstance.start(
                { facingMode: "environment" },
                config,
                (decodedText, decodedResult) => {
                    // Use post‑processing to validate and buffer scanned codes
                    processScannedCode(decodedText);
                },
                (errorMessage) => {
                    console.debug('Scan error:', errorMessage);
                }
            );
            return;
        }
    } catch (err) {
        console.error('Gagal memulai scan kamera:', err);
        alert('Gagal memulai scan kamera. Pastikan kamera tersedia dan izin diberikan.');
        // Bersihkan UI jika gagal memulai
        await stopCameraScan();
    }
}

/**
 * Menangani hasil barcode yang dipindai dari kamera. Fungsi ini akan
 * memasukkan hasil scan ke input barcode, memproses saran produk, dan jika
 * barcode persis ada dalam daftar produk maka produk akan langsung
 * ditambahkan ke keranjang.
 * @param {string} code
 */
function handleDecodedBarcode(code) {
    const barcodeInput = document.getElementById('barcodeInput');
    if (!barcodeInput) return;
    // Masukkan hasil ke input dan tampilkan saran
    barcodeInput.value = code;
    showProductSuggestions(code);

    // Jika barcode cocok dengan produk, tambahkan ke keranjang secara otomatis
    const matchedProduct = products.find(p => p.barcode && p.barcode.toString() === code);
    if (matchedProduct) {
        addToCart({ id: matchedProduct.id, name: matchedProduct.name, price: matchedProduct.price, stock: matchedProduct.stock });
        // Play a short beep to provide audible feedback that the barcode has been captured
        playBeep();
        // Setelah menambahkan ke keranjang, kosongkan input untuk scan berikutnya
        barcodeInput.value = '';
        hideProductSuggestions();
    }
}

/**
 * Menghentikan pemindaian kamera dan membersihkan UI. Digunakan ketika
 * pengguna menekan tombol stop atau ketika pemindaian selesai.
 */
async function stopCameraScan() {
    const startBtn = document.getElementById('startCameraScanButton');
    const stopBtn = document.getElementById('stopCameraScanButton');
    const scannerDiv = document.getElementById('cameraScanner');
    if (!startBtn || !stopBtn || !scannerDiv) return;
    try {
        if (cameraScannerInstance) {
            await cameraScannerInstance.stop();
            cameraScannerInstance.clear();
            cameraScannerInstance = null;
        }
        // Stop QuaggaJS scanning if active
        if (quaggaScannerActive && typeof Quagga !== 'undefined') {
            // Removing event listener before stopping ensures no further callbacks fire
            if (_onQuaggaDetected) {
                Quagga.offDetected(_onQuaggaDetected);
            }
            Quagga.stop();
            quaggaScannerActive = false;
        }
    } catch (err) {
        console.error('Gagal menghentikan scan kamera:', err);
    } finally {
        // Sembunyikan container dan tombol stop, tampilkan tombol start
        scannerDiv.classList.add('hidden');
        stopBtn.classList.add('hidden');
        startBtn.classList.remove('hidden');
    }
}

// Pastikan fungsi tersedia secara global bila dipanggil dari HTML
window.isMobileDevice = isMobileDevice;
window.initializeMobileScanner = initializeMobileScanner;
window.startCameraScan = startCameraScan;
window.stopCameraScan = stopCameraScan;

/**
 * Reference to the currently registered Quagga onDetected callback.
 * Used to unregister the callback when the scanner is stopped to prevent
 * memory leaks and duplicate events.
 * @type {function|null}
 */
let _onQuaggaDetected = null;

/**
 * Memulai pemindaian menggunakan QuaggaJS.  Fungsi ini membungkus inisialisasi
 * QuaggaJS ke dalam sebuah Promise sehingga dapat digunakan dengan async/await.
 * @param {HTMLElement} targetEl Elemen DOM tempat video stream ditampilkan.
 * @returns {Promise<void>} Menyelesaikan ketika Quagga berhasil diinisialisasi.
 */
function startQuaggaScan(targetEl) {
    return new Promise((resolve, reject) => {
        if (typeof Quagga === 'undefined') {
            reject(new Error('QuaggaJS tidak tersedia'));
            return;
        }
        // Konfigurasi QuaggaJS untuk menggunakan kamera belakang dan mendekode
        // berbagai format barcode 1D. Parameter locate=true meningkatkan
        // kemungkinan menemukan kode di frame meskipun posisinya tidak ideal.
        const config = {
            inputStream: {
                name: 'Live',
                type: 'LiveStream',
                target: targetEl,
                constraints: {
                    facingMode: 'environment'
                }
            },
            decoder: {
                readers: [
                    'ean_reader',
                    'ean_8_reader',
                    'code_128_reader',
                    'code_39_reader',
                    'code_39_vin_reader',
                    'upc_reader',
                    'upc_e_reader',
                    'codabar_reader',
                    'i2of5_reader',
                    '2of5_reader',
                    'code_93_reader'
                ]
            },
            locate: true,
            numOfWorkers: navigator.hardwareConcurrency ? navigator.hardwareConcurrency : 4
        };
        _onQuaggaDetected = function(result) {
            if (result && result.codeResult && result.codeResult.code) {
                const code = result.codeResult.code;
                // Process the code using our buffer and checksum validation
                processScannedCode(code);
            }
        };
        Quagga.init(config, function(err) {
            if (err) {
                console.error('Quagga init error:', err);
                reject(err);
                return;
            }
            Quagga.onDetected(_onQuaggaDetected);
            Quagga.start();
            quaggaScannerActive = true;
            resolve();
        });
    });
}

// -----------------------------------------------------------------------------
// Global scanner toggle utilities
//
// These helpers manage the UI state of the standby toggle button and flip
// the globalScannerEnabled flag.  When disabled, keystrokes are ignored by
// the global scanner listener so that operators can type product names or
// perform other interactions without triggering unintended barcode actions.

/**
 * Update the appearance and label of the global scanner toggle button to
 * reflect whether scanning is currently enabled.  Called after toggling
 * and on initial page load.
 */
function updateScanToggleButton() {
    const btn = document.getElementById('toggleScanButton');
    if (!btn) return;
    if (globalScannerEnabled) {
        // Enabled: yellow background and 'Scan ON'
        btn.classList.remove('bg-gray-400', 'hover:bg-gray-500');
        btn.classList.add('bg-yellow-500', 'hover:bg-yellow-600');
        btn.innerHTML = '🔄 <span class="hidden sm:inline">Scan ON</span>';
    } else {
        // Disabled: gray background and 'Scan OFF'
        btn.classList.remove('bg-yellow-500', 'hover:bg-yellow-600');
        btn.classList.add('bg-gray-400', 'hover:bg-gray-500');
        btn.innerHTML = '⏸️ <span class="hidden sm:inline">Scan OFF</span>';
    }
}

/**
 * Toggle the global scanner standby state on or off.  When disabled the
 * listener early returns and scanning must be performed via the dedicated
 * input field.  After flipping the state the toggle button is updated.
 */
function toggleGlobalScanner() {
    globalScannerEnabled = !globalScannerEnabled;
    updateScanToggleButton();
}

// Expose the toggle functions globally so they can be called from inline
// onclick attributes defined in the HTML.
window.toggleGlobalScanner = toggleGlobalScanner;
window.updateScanToggleButton = updateScanToggleButton;

// Keyboard shortcut: Ctrl+Enter to initiate payment from the Scanner tab
// When the scanner tab is active and the cart has items, pressing Ctrl+Enter
// will open the unified payment modal. This helps operators quickly proceed
// to payment without manually clicking the pay button in the floating cart.
document.addEventListener('keydown', function(e) {
    // Only act on Ctrl + Enter
    const isCtrlEnter = e.ctrlKey && (e.key === 'Enter' || e.keyCode === 13);
    if (!isCtrlEnter) return;

    // Determine if Scanner tab content is currently visible
    const scannerContent = document.getElementById('scannerContent');
    if (!scannerContent || scannerContent.classList.contains('hidden')) {
        return;
    }

    // If there are items in the cart, open the payment modal
    if (Array.isArray(cart) && cart.length > 0) {
        e.preventDefault();
        showUnifiedPaymentModal();
    }
});
