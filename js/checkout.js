/*
 * CHECKOUT.JS
 * ===========
 * Wires wallet.js into the checkout page UI.
 *
 * What this file does:
 * 1. Listens for clicks on the "Connect MetaMask" button
 * 2. Calls connectWallet() from wallet.js
 * 3. Shows loading/connecting states during wallet interaction
 * 4. Updates the UI to show wallet info (address, network, balance)
 * 5. Handles errors (MetaMask not installed, user rejected, wrong network)
 * 6. Enables the "Pay" button once wallet is connected on Sepolia
 * 7. Shows a step-by-step transaction progress indicator during payment
 * 8. On success, saves booking data to sessionStorage and redirects to ticket page
 */


// =============================================
// DOM REFERENCES
// =============================================

// The three wallet state panels
const walletNotConnected = document.getElementById('walletNotConnected');
const walletConnecting = document.getElementById('walletConnecting');
const walletConnected = document.getElementById('walletConnected');

// Buttons
const connectWalletBtn = document.getElementById('connectWalletBtn');
const payBtn = document.getElementById('payBtn');

// Wallet info display elements (inside the "Connected" panel)
const addressDisplay = document.querySelector('#walletConnected .wallet-info-row:nth-child(2) .wallet-info-value');
const networkDisplay = document.querySelector('#walletConnected .wallet-info-row:nth-child(3) .wallet-info-value');
const balanceDisplay = document.querySelector('#walletConnected .wallet-info-row:nth-child(4) .wallet-info-value');

// Transaction progress elements
const txProgress = document.getElementById('txProgress');
const txStep1 = document.getElementById('txStep1');
const txStep2 = document.getElementById('txStep2');
const txStep3 = document.getElementById('txStep3');
const txMiningBar = document.getElementById('txMiningBar');


// =============================================
// DYNAMIC BOOKING DATA FROM URL
// =============================================

/*
 * Read booking info from URL params (passed from seats page).
 * This replaces the old hardcoded values.
 */
const checkoutParams = new URLSearchParams(window.location.search);
const CHECKOUT_MOVIE_ID = checkoutParams.get('id') || '1';
const CHECKOUT_DATE = checkoutParams.get('date') || '';
const CHECKOUT_TIME = checkoutParams.get('time') || '';
const CHECKOUT_SEATS = checkoutParams.get('seats') || '';
const TOTAL_ETH = window.CHECKOUT_TOTAL || checkoutParams.get('total') || '0.000';


// =============================================
// HANDLE WALLET CONNECTION
// =============================================

/**
 * Called when the user clicks "Connect MetaMask".
 *
 * Flow:
 * 1. Show connecting/loading state
 * 2. Call connectWallet() from wallet.js
 * 3. If successful, update the UI to show wallet info
 * 4. If on wrong network, prompt to switch to Sepolia
 * 5. Enable the Pay button
 * 6. If error, reset UI and show an alert
 */
async function handleConnect() {
    try {
        // --- Show loading state on the connect button ---
        if (connectWalletBtn) {
            connectWalletBtn.classList.add('btn-connecting');
            connectWalletBtn.innerHTML = '<span class="spinner"></span> Connecting...';
        }

        // --- Show the connecting panel (spinner + message) ---
        if (walletConnecting) {
            walletNotConnected.style.display = 'none';
            walletConnecting.style.display = 'flex';
        }

        // --- Call wallet.js to connect ---
        const wallet = await connectWallet();

        // --- Update the UI: hide connecting, show "Connected" ---
        if (walletConnecting) {
            walletConnecting.style.display = 'none';
        }
        walletNotConnected.style.display = 'none';
        walletConnected.style.display = 'flex';

        // --- Fill in the wallet details ---
        addressDisplay.textContent = wallet.shortAddress;
        networkDisplay.textContent = wallet.networkName;
        balanceDisplay.textContent = wallet.balance + ' ETH';

        // --- Check network ---
        if (!wallet.isCorrectNetwork) {
            networkDisplay.textContent = wallet.networkName + ' (wrong network)';
            networkDisplay.style.color = '#EF4566';

            const shouldSwitch = confirm(
                'You are connected to ' + wallet.networkName + '.\n\n' +
                'Tixxer requires the Sepolia test network.\n' +
                'Would you like to switch to Sepolia?'
            );

            if (shouldSwitch) {
                const switched = await switchToSepolia();
                if (switched) {
                    const updatedWallet = await connectWallet();
                    addressDisplay.textContent = updatedWallet.shortAddress;
                    networkDisplay.textContent = updatedWallet.networkName;
                    networkDisplay.style.color = '';
                    balanceDisplay.textContent = updatedWallet.balance + ' ETH';
                }
            }
        }

        // --- Enable the Pay button if on correct network ---
        if (walletState.isCorrectNetwork) {
            payBtn.disabled = false;
        }

    } catch (error) {
        // --- Reset connecting state ---
        if (connectWalletBtn) {
            connectWalletBtn.classList.remove('btn-connecting');
            connectWalletBtn.innerHTML = 'Connect MetaMask';
        }

        if (walletConnecting) {
            walletConnecting.style.display = 'none';
            walletNotConnected.style.display = 'flex';
        }

        if (error.message.includes('not installed')) {
            alert(
                'MetaMask is not installed.\n\n' +
                'Please install MetaMask from:\nhttps://metamask.io'
            );
        } else if (error.code === 4001) {
            alert('Connection cancelled. You can try again when ready.');
        } else {
            alert('Connection error: ' + error.message);
        }

        console.error('Wallet connection error:', error);
    }
}


// =============================================
// EVENT LISTENERS
// =============================================

if (connectWalletBtn) {
    connectWalletBtn.addEventListener('click', handleConnect);
}

if (payBtn) {
    payBtn.addEventListener('click', handlePayment);
}


// =============================================
// TRANSACTION PROGRESS HELPER
// =============================================

function updateTxStep(stepEl, state) {
    if (!stepEl) return;
    stepEl.classList.remove('pending', 'active', 'completed');
    stepEl.classList.add(state);

    if (state === 'completed') {
        stepEl.querySelector('.tx-step-icon').textContent = '\u2713';
    }
}

function resetTxProgress() {
    if (!txProgress) return;
    txProgress.classList.remove('active');

    [txStep1, txStep2, txStep3].forEach(function(step, index) {
        if (step) {
            step.classList.remove('active', 'completed');
            step.classList.add('pending');
            step.querySelector('.tx-step-icon').textContent = String(index + 1);
        }
    });

    if (txMiningBar) txMiningBar.style.display = 'none';
}


// =============================================
// HANDLE PAYMENT
// =============================================

/**
 * Called when the user clicks "Pay X.XXX ETH".
 *
 * Flow:
 * 1. Show loading state on the Pay button
 * 2. Show transaction progress indicator
 * 3. Call sendPayment() from wallet.js with progress callback
 * 4. On success: save all booking data to sessionStorage, redirect to ticket page
 * 5. On failure: show error, reset button for retry
 */
async function handlePayment() {

    // Auth gate — block payment if not logged in
    const tixxerUser = requireTixxerAuth();
    if (!tixxerUser) return;

    // --- Step 1: Show loading state ---
    payBtn.disabled = true;
    payBtn.innerHTML = '<span class="spinner"></span> Waiting for approval...';
    payBtn.classList.add('btn-processing');

    // --- Step 2: Show the transaction progress indicator ---
    if (txProgress) {
        txProgress.classList.add('active');
        updateTxStep(txStep1, 'active');
    }

    // --- Step 3: Progress callback ---
    function onProgress(stage) {
        if (!txProgress) return;

        if (stage === 'broadcast') {
            updateTxStep(txStep1, 'completed');
            updateTxStep(txStep2, 'completed');
            updateTxStep(txStep3, 'active');
            if (txMiningBar) txMiningBar.style.display = 'block';
            payBtn.innerHTML = '<span class="spinner"></span> Confirming on blockchain...';
        }

        if (stage === 'confirmed') {
            updateTxStep(txStep3, 'completed');
            if (txMiningBar) txMiningBar.style.display = 'none';
        }
    }

    // --- Step 4: Send the transaction ---
    const result = await sendPayment(TOTAL_ETH, onProgress);

    // --- Step 5: Handle the result ---
    if (result.success) {
        // Save transaction data to sessionStorage for the ticket page
        sessionStorage.setItem('tixxer_txHash', result.txHash);
        sessionStorage.setItem('tixxer_amountPaid', TOTAL_ETH);

        if (walletState.address) {
            sessionStorage.setItem('tixxer_walletAddress', walletState.address);
        }

        // Save booking info dynamically from URL params
        var movie = typeof getMovie === 'function' ? getMovie(parseInt(CHECKOUT_MOVIE_ID)) : null;
        sessionStorage.setItem('tixxer_movieId', CHECKOUT_MOVIE_ID);
        sessionStorage.setItem('tixxer_movieName', movie ? movie.title : 'Unknown');
        sessionStorage.setItem('tixxer_moviePoster', movie ? movie.poster : '');
        sessionStorage.setItem('tixxer_seats', CHECKOUT_SEATS);
        sessionStorage.setItem('tixxer_showDate', CHECKOUT_DATE);
        sessionStorage.setItem('tixxer_showTime', CHECKOUT_TIME);

        // Show success state briefly before redirecting
        payBtn.innerHTML = '&#10003; Payment confirmed!';
        payBtn.classList.remove('btn-processing');
        payBtn.classList.add('btn-success');

        // --- Save booking to MongoDB ---
        // This runs in the background — we don't block the redirect for it.
        // If it fails, the ticket still shows (data is in sessionStorage).
        saveBookingToDatabase({
            movieId:       CHECKOUT_MOVIE_ID,
            movieName:     movie ? movie.title : 'Unknown',
            date:          CHECKOUT_DATE,
            time:          CHECKOUT_TIME,
            seats:         CHECKOUT_SEATS.split(','),
            totalETH:      TOTAL_ETH,
            walletAddress: walletState.address || 'unknown',
            txHash:        result.txHash
        });

        // Build ticket page URL with movie ID for backdrop
        setTimeout(function() {
            window.location.href = 'ticket.html?id=' + CHECKOUT_MOVIE_ID;
        }, 1500);

    } else {
        payBtn.innerHTML = '<span class="pay-btn-icon">&#9830;</span> Pay ' + TOTAL_ETH + ' ETH';
        payBtn.disabled = false;
        payBtn.classList.remove('btn-processing');
        resetTxProgress();
        alert(result.error);
    }
}


// =============================================
// SAVE BOOKING TO MONGODB
// =============================================

/**
 * Sends the booking data to our API which saves it in MongoDB.
 *
 * This is a "fire and forget" call — we don't wait for it to finish
 * before redirecting to the ticket page. If it fails, we log the error
 * but the user still gets their ticket (from sessionStorage).
 *
 * @param {Object} bookingData — The booking details to save
 */
function saveBookingToDatabase(bookingData) {
    fetch('/api/save-booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bookingData)
    })
    .then(function(response) { return response.json(); })
    .then(function(data) {
        if (data.success) {
            console.log('Booking saved to database:', data.bookingId);
        } else {
            console.warn('Failed to save booking:', data.error);
        }
    })
    .catch(function(error) {
        // Don't block the user — just log the error
        console.warn('Could not save booking to database:', error.message);
    });
}


// =============================================
// METAMASK EVENT LISTENERS
// =============================================

if (typeof window.ethereum !== 'undefined') {
    window.ethereum.on('accountsChanged', function() {
        window.location.reload();
    });

    window.ethereum.on('chainChanged', function() {
        window.location.reload();
    });
}
