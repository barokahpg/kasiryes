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

// URL of your deployed Google Apps Script Web App
// IMPORTANT: Replace the value below with the Web App URL obtained
// from deploying the Apps Script in Google Sheets.
// Example: "https://script.google.com/macros/s/AKfycb1234567890/exec"
// Inserted by request: Use the actual Web App URL provided by the user for Google Apps Script integration
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
    // Ini memastikan data produk, penjualan, dan hutang di aplikasi selalu sinkron dengan spreadsheet.
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
        // Barcode input: handle Enter to add product by barcode or search term
        if (target.id === 'barcodeInput') {
            // Delegate to existing handler for Enter key detection
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
    // Barcode input: handle Enter for barcode scanning and show suggestions while typing
    const barcodeInputEl = document.getElementById('barcodeInput');
    if (barcodeInputEl) {
        // Ensure the keydown handler is attached for Enter key processing
        barcodeInputEl.addEventListener('keydown', handleBarcodeInput);
        // Show suggestions on every input change
        barcodeInputEl.addEventListener('input', function(e) {
            const term = e.target.value.trim();
            showProductSuggestions(term);
        });
    }
    // Products tab search input
    const productSearchEl = document.getElementById('productSearchInput');
    if (productSearchEl) {
        productSearchEl.addEventListener('input', function(e) {
            searchProducts(e.target.value.trim());
        });
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
                displayTransactionHistory();
            }
        }

        // Load/Save data
        function loadData() {
            const savedProducts = localStorage.getItem('kasir_products');
            if (savedProducts) products = JSON.parse(savedProducts);
            
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

            suggestionsContainer.classList.remove('hidden');
        }

        function hideProductSuggestions() {
            document.getElementById('productSuggestions').classList.add('hidden');
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
                const newQuantity = existingItem.quantity + quantity;
                if (product.stock < newQuantity) {
                    alert(`Stok tidak mencukupi! Stok tersedia: ${product.stock}`);
                    return;
                }
                existingItem.quantity = newQuantity;
                
                // Update price based on wholesale pricing
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
            } else {
                // Check if quantity qualifies for wholesale pricing
                const fullProduct = products.find(p => p.id === product.id);
                let itemPrice = product.price;
                let isWholesale = false;
                
                if (fullProduct && fullProduct.wholesaleMinQty && fullProduct.wholesalePrice && quantity >= fullProduct.wholesaleMinQty) {
                    itemPrice = fullProduct.wholesalePrice;
                    isWholesale = true;
                }
                
                cart.push({
                    id: product.id,
                    name: product.name,
                    price: itemPrice,
                    quantity: quantity,
                    isWholesale: isWholesale
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
                description: description || null
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
            if (cart.length > 0 && confirm('Yakin ingin mengosongkan keranjang?')) {
                cart = [];
                updateCartDisplay();
                updateTotal();
            }
        }

        function updateTotal() {
            const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
            const discount = parseInt(document.getElementById('discountInput').value) || 0;
            const total = subtotal - (subtotal * discount / 100);
            
            document.getElementById('subtotal').textContent = formatCurrency(subtotal);
            document.getElementById('total').textContent = formatCurrency(total);
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
                            <div class="font-medium text-gray-800">${item.name}${isServiceItem ? '<span class="bg-purple-500 text-white px-1 rounded text-xs ml-1">🔧 JASA</span>' : ''}</div>
                            ${isServiceItem && item.description ? `<div class="text-xs text-purple-600 italic mt-1">"${item.description}"</div>` : ''}
                        </td>
                        <td class="px-3 py-3 text-right">${formatCurrency(item.price)}</td>
                        <td class="px-3 py-3 text-center">
                            ${isServiceItem ? '1' : `
                                <div class="flex items-center justify-center space-x-1">
                                    <button onclick="updateQuantity(${item.id}, -1)" class="bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded text-xs">-</button>
                                    <input type="number" value="${item.quantity}" min="1" max="999" 
                                           class="w-12 px-1 py-0 border rounded text-xs text-center" 
                                           onchange="setQuantity(${item.id}, this.value)"
                                           onkeypress="handleQuantityKeypress(event, ${item.id})"
                                           onclick="this.select()">
                                    <button onclick="updateQuantity(${item.id}, 1)" class="bg-green-500 hover:bg-green-600 text-white px-2 py-1 rounded text-xs">+</button>
                                </div>
                            `}
                        </td>
                        <td class="px-3 py-3 text-right">${formatCurrency(item.price * item.quantity)}</td>
                        <td class="px-3 py-3 text-center">
                            <button onclick="removeFromCart('${item.id}')" class="bg-gray-500 hover:bg-gray-600 text-white px-2 py-1 rounded text-xs">×</button>
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
            container.className = 'overflow-x-auto';
            let tableHtml = '<table class="w-full text-sm">';
            tableHtml += '<thead class="bg-gray-100"><tr>' +
                         '<th class="px-4 py-2 text-left font-semibold text-gray-700">Nama Produk</th>' +
                         '<th class="px-4 py-2 text-left font-semibold text-gray-700">Harga</th>' +
                         '<th class="px-4 py-2 text-left font-semibold text-gray-700">Modal</th>' +
                         '<th class="px-4 py-2 text-left font-semibold text-gray-700">Stok</th>' +
                         '<th class="px-4 py-2 text-left font-semibold text-gray-700">Barcode</th>' +
                         '<th class="px-4 py-2 text-center font-semibold text-gray-700">Aksi</th>' +
                         '</tr></thead><tbody>';
            tableHtml += list.map(product => {
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
                displaySavedProducts();
                displayScannerProductTable();
                closeAddProductModal();
                alert(`Produk jasa "${name}" berhasil ditambahkan!`);
                // Auto-export to Google Sheets silently when a new service product is added
                try {
                    // Perform export without showing notifications or blocking the UI
                    exportDataToGoogleSheets(true).catch(err => console.error('Auto export failed:', err));
                } catch (err) {
                    console.error('Auto export failed:', err);
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
            displaySavedProducts();
            displayScannerProductTable();
            closeAddProductModal();
            
            let message = `Produk "${name}" berhasil ditambahkan!`;
            if (wholesaleMinQty > 0 && wholesalePrice > 0) {
                message += `\n🏪 Harga grosir: ${formatCurrency(wholesalePrice)} (min ${wholesaleMinQty} pcs)`;
            }
            alert(message);
            // Auto-export to Google Sheets silently when a new product is added
            try {
                exportDataToGoogleSheets(true).catch(err => console.error('Auto export failed:', err));
            } catch (err) {
                console.error('Auto export failed:', err);
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
            displaySavedProducts();
            displayScannerProductTable();
            closeEditProductModal();
            
            let message = `Produk "${name}" berhasil diupdate!`;
            if (wholesaleMinQty > 0 && wholesalePrice > 0) {
                message += `\n🏪 Harga grosir: ${formatCurrency(wholesalePrice)} (min ${wholesaleMinQty} pcs)`;
            }
            alert(message);
            // Auto-export to Google Sheets silently when a product is edited
            try {
                exportDataToGoogleSheets(true).catch(err => console.error('Auto export failed:', err));
            } catch (err) {
                console.error('Auto export failed:', err);
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

            if (confirm(`Yakin ingin menghapus produk "${product.name}"?\n\nPerhatian: Data ini tidak dapat dikembalikan!`)) {
                // Remove product from array
                const productIndex = products.findIndex(p => p.id === editingProductId);
                if (productIndex !== -1) {
                    products.splice(productIndex, 1);
                    saveData();
                    displaySavedProducts();
                    displayScannerProductTable();
                    closeEditProductModal();
                    alert(`Produk "${product.name}" berhasil dihapus!`);
                    // Auto-export to Google Sheets silently when a product is deleted
                    try {
                        exportDataToGoogleSheets(true).catch(err => console.error('Auto export failed:', err));
                    } catch (err) {
                        console.error('Auto export failed:', err);
                    }
                }
            }
        }

        // Unified Payment functions
        function showUnifiedPaymentModal() {
            if (cart.length === 0) {
                alert('Keranjang masih kosong!');
                return;
            }

            const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
            const discount = parseInt(document.getElementById('discountInput').value) || 0;
            const total = subtotal - (subtotal * discount / 100);

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
            const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
            const discount = parseInt(document.getElementById('discountInput').value) || 0;
            const total = subtotal - (subtotal * discount / 100);
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
            const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
            const discount = parseInt(document.getElementById('discountInput').value) || 0;
            const total = subtotal - (subtotal * discount / 100);
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
                
                processPartialPaymentUnified(subtotal, discount, total, paid, customerName);
            } else {
                // Full payment (exact or with change)
                processFullPaymentUnified(subtotal, discount, total, paid);
            }
        }

        function processFullPaymentUnified(subtotal, discount, total, paid) {
            const transaction = {
                id: Date.now(),
                items: [...cart],
                subtotal: subtotal,
                discount: discount,
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

            // Print receipt
            printThermalReceipt(transaction);

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

            if (paid === total) {
                alert('Pembayaran berhasil! Pembayaran pas, tidak ada kembalian.');
            } else {
                alert(`Pembayaran berhasil! Kembalian: ${formatCurrency(paid - total)}`);
            }
            displaySavedProducts(); // Refresh product display
            displayScannerProductTable(); // Refresh scanner table
            // Auto-export to Google Sheets silently after a full payment transaction
            try {
                exportDataToGoogleSheets(true).catch(err => console.error('Auto export failed:', err));
            } catch (err) {
                console.error('Auto export failed:', err);
            }
        }

        function processPartialPaymentUnified(subtotal, discount, total, paid, customerName) {
            const debt = total - paid;

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

            // Print receipt
            printThermalReceipt(transaction);

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
            // Auto-export to Google Sheets silently after a partial payment transaction
            try {
                exportDataToGoogleSheets(true).catch(err => console.error('Auto export failed:', err));
            } catch (err) {
                console.error('Auto export failed:', err);
            }
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

            // Print receipt
            printThermalReceipt(transaction);

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
                                            <td class="px-4 py-3 text-right font-semibold text-blue-600">${formatCurrency(transaction.amount)}</td>
                                            <td class="px-4 py-3 text-right font-semibold text-blue-600">${formatCurrency(transaction.amount)}</td>
                                            <td class="px-4 py-3 text-right">
                                                <span class="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs font-semibold">
                                                    💰 Cicilan
                                                </span>
                                                ${transaction.remainingDebt ? `<br><span class="text-xs text-red-600">Sisa: ${formatCurrency(transaction.remainingDebt)}</span>` : '<br><span class="text-xs text-green-600">Lunas</span>'}
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
                                            <td class="px-4 py-3 text-right font-semibold text-blue-600">${formatCurrency(transaction.amount)}</td>
                                            <td class="px-4 py-3 text-right font-semibold text-blue-600">${formatCurrency(transaction.amount)}</td>
                                            <td class="px-4 py-3 text-right">
                                                <span class="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs font-semibold">
                                                    💰 Cicilan
                                                </span>
                                                ${transaction.remainingDebt ? `<br><span class="text-xs text-red-600">Sisa: ${formatCurrency(transaction.remainingDebt)}</span>` : '<br><span class="text-xs text-green-600">Lunas</span>'}
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
                                            <td class="px-4 py-3 text-right font-semibold text-blue-600">${formatCurrency(transaction.amount)}</td>
                                            <td class="px-4 py-3 text-right font-semibold text-blue-600">${formatCurrency(transaction.amount)}</td>
                                            <td class="px-4 py-3 text-right">
                                                <span class="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs font-semibold">
                                                    💰 Cicilan
                                                </span>
                                                ${transaction.remainingDebt ? `<br><span class="text-xs text-red-600">Sisa: ${formatCurrency(transaction.remainingDebt)}</span>` : '<br><span class="text-xs text-green-600">Lunas</span>'}
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
                        const product = products.find(p => p.id === item.id);
                        if (product && product.modalPrice && !isNaN(product.modalPrice) && item.quantity && !isNaN(item.quantity)) {
                            totalModal += product.modalPrice * item.quantity;
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
                        
                        if (!productStats[item.id]) {
                            const product = products.find(p => p.id === item.id);
                            productStats[item.id] = {
                                name: item.name,
                                sold: 0,
                                revenue: 0,
                                modal: 0,
                                modalPrice: product ? (product.modalPrice || 0) : 0
                            };
                        }
                        
                        if (!isNaN(item.quantity) && !isNaN(item.price)) {
                            productStats[item.id].sold += item.quantity;
                            productStats[item.id].revenue += item.price * item.quantity;
                            productStats[item.id].modal += productStats[item.id].modalPrice * item.quantity;
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
                        const product = products.find(p => p.id === item.id);
                        if (product && product.modalPrice && !isNaN(product.modalPrice) && item.quantity && !isNaN(item.quantity)) {
                            totalModal += product.modalPrice * item.quantity;
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
            if (confirm(`Yakin ingin melunasi hutang ${customerName} sebesar ${formatCurrency(amount)}?`)) {
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
                        timestamp: new Date().toISOString()
                    };
                    
                    salesData.push(paymentRecord);
                    saveData();
                    
                    alert(`Hutang ${customerName} sebesar ${formatCurrency(amount)} telah dilunasi!`);
                    showReports(); // Refresh the reports modal
                }
            }
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
                    timestamp: new Date().toISOString()
                };
                
                salesData.push(paymentRecord);
                saveData();
                
                closeDebtPaymentModal();
                showReports(); // Refresh the reports modal
                // Auto-export to Google Sheets silently after a debt payment transaction
                try {
                    exportDataToGoogleSheets(true).catch(err => console.error('Auto export failed:', err));
                } catch (err) {
                    console.error('Auto export failed:', err);
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
                <div style="width: 300px; font-family: monospace; font-size: 12px; line-height: 1.2;">
                    <div style="text-align: center; margin-bottom: 10px;">
                        <div style="font-size: 16px; font-weight: bold;">TOKO BAROKAH</div>
                        <div style="font-size: 10px;">RT 02 Desa Pematang Gadung</div>
                        <div style="font-size: 10px;">================================</div>
                    </div>
                    
                    <div style="margin-bottom: 10px;">
                        <div>No: ${transaction.id}</div>
                        <div>Tanggal: ${date.toLocaleString('id-ID')}</div>
                        <div>Kasir: Admin</div>
                        ${isPartial ? `<div>Pelanggan: ${transaction.customerName}</div>` : ''}
                        <div>================================</div>
                    </div>
                    
                    <div style="margin-bottom: 10px;">
                        ${transaction.items.map(item => `
                            <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
                                <div style="flex: 1;">${item.name}${item.isService ? ' (JASA)' : ''}</div>
                            </div>
                            ${item.description ? `<div style="font-size: 10px; color: #666; margin-bottom: 2px;">"${item.description}"</div>` : ''}
                            <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                                <div>${item.quantity} x ${formatCurrency(item.price)}</div>
                                <div>${formatCurrency(item.price * item.quantity)}</div>
                            </div>
                        `).join('')}
                        <div>================================</div>
                    </div>
                    
                    <div style="margin-bottom: 10px;">
                        <div style="display: flex; justify-content: space-between;">
                            <div>Subtotal:</div>
                            <div>${formatCurrency(transaction.subtotal)}</div>
                        </div>
                        ${transaction.discount > 0 ? `
                            <div style="display: flex; justify-content: space-between;">
                                <div>Diskon (${transaction.discount}%):</div>
                                <div>-${formatCurrency(transaction.subtotal * transaction.discount / 100)}</div>
                            </div>
                        ` : ''}
                        <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 14px;">
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
                <div style="width: 300px; font-family: monospace; font-size: 12px; line-height: 1.2;">
                    <div style="text-align: center; margin-bottom: 10px;">
                        <div style="font-size: 16px; font-weight: bold;">TOKO BAROKAH</div>
                        <div style="font-size: 10px;">RT 02 Desa Pematang Gadung</div>
                        <div style="font-size: 10px;">================================</div>
                        <div style="font-size: 14px; font-weight: bold; margin-top: 5px;">BUKTI PEMBAYARAN HUTANG</div>
                    </div>
                    
                    <div style="margin-bottom: 10px;">
                        <div>No: ${transaction.id}</div>
                        <div>Tanggal: ${new Date(transaction.timestamp).toLocaleString('id-ID')}</div>
                        <div>Kasir: Admin</div>
                        <div>Pelanggan: ${transaction.customerName}</div>
                        <div>================================</div>
                    </div>
                    
                    <div style="margin-bottom: 10px;">
                        <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 14px;">
                            <div>PEMBAYARAN HUTANG:</div>
                            <div>${formatCurrency(transaction.amount)}</div>
                        </div>
                        ${transaction.remainingDebt ? `
                            <div style="display: flex; justify-content: space-between; color: red;">
                                <div>Sisa Hutang:</div>
                                <div>${formatCurrency(transaction.remainingDebt)}</div>
                            </div>
                        ` : `
                            <div style="display: flex; justify-content: space-between; color: green;">
                                <div>Status:</div>
                                <div>LUNAS</div>
                            </div>
                        `}
                    </div>
                    
                    <div style="text-align: center; margin-top: 15px; font-size: 10px;">
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
        s.debt ?? '',
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

/**
 * Inisialisasi tampilan dan event handler untuk pemindai kamera di perangkat mobile.
 * Menampilkan tombol pemindaian jika perangkat adalah mobile dan library
 * Html5Qrcode tersedia. Jika library belum dimuat (misal offline), maka
 * tombol akan tetap tersembunyi.
 */
function initializeMobileScanner() {
    const optionsContainer = document.getElementById('mobileScanOptions');
    const startBtn = document.getElementById('startCameraScanButton');
    const stopBtn = document.getElementById('stopCameraScanButton');

    // Pastikan elemen-elemen exist sebelum melanjutkan.
    if (!optionsContainer || !startBtn || !stopBtn) return;

    // Tampilkan opsi hanya jika perangkat mobile.
    if (isMobileDevice()) {
        optionsContainer.classList.remove('hidden');
    } else {
        // Tidak perlu opsi pada desktop
        return;
    }

    // Cek ketersediaan library pemindai. Jika tidak ada, jangan daftarkan event.
    if (typeof Html5Qrcode === 'undefined') {
        console.warn('Library html5-qrcode tidak tersedia. Pemindaian kamera tidak akan berfungsi.');
        return;
    }

    // Daftarkan event klik untuk memulai pemindaian kamera.
    startBtn.addEventListener('click', async () => {
        await startCameraScan();
    });

    // Daftarkan event klik untuk menghentikan pemindaian kamera.
    stopBtn.addEventListener('click', async () => {
        await stopCameraScan();
    });
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
    if (cameraScannerInstance) {
        return;
    }

    // Pastikan library tersedia.
    if (typeof Html5Qrcode === 'undefined') {
        alert('Fitur scan kamera tidak tersedia. Pastikan koneksi internet atau library disertakan.');
        return;
    }

    // Tampilkan container dan tombol stop, sembunyikan tombol start
    scannerDiv.classList.remove('hidden');
    stopBtn.classList.remove('hidden');
    startBtn.classList.add('hidden');

    try {
        // Buat instance pemindai dengan ID container.
        cameraScannerInstance = new Html5Qrcode('cameraScanner');
        // Konfigurasi pemindaian. Selain fps dan opsi kamera, kami secara eksplisit
        // menentukan format barcode yang didukung dan mengaktifkan penggunaan
        // BarcodeDetector (jika tersedia) untuk meningkatkan akurasi 1D barcode.
        const config = {
            fps: 10,
            // Jika qrbox diaktifkan, hanya area tertentu yang akan discan.
            // Biarkan undefined agar library memilih ukuran optimal secara otomatis.
            // qrbox: 250,
            rememberLastUsedCamera: true,
            // Aktifkan penggunaan API BarcodeDetector apabila browser mendukung
            useBarCodeDetectorIfSupported: true,
            // Batasi pemindaian hanya ke format kode yang kita dukung untuk
            // meningkatkan performa dan keakuratan, terutama untuk kode batang 1D.
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

        // Mulai dengan kamera belakang/default. facingMode: "environment" menggunakan
        // kamera belakang pada perangkat mobile.
        await cameraScannerInstance.start(
            { facingMode: "environment" },
            config,
            (decodedText, decodedResult) => {
                handleDecodedBarcode(decodedText);
            },
            (errorMessage) => {
                // Perangkat masih memindai; abaikan kesalahan antar-frame.
                console.debug('Scan error:', errorMessage);
            }
        );
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
        }
    } catch (err) {
        console.error('Gagal menghentikan scan kamera:', err);
    } finally {
        cameraScannerInstance = null;
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
