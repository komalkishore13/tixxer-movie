/*
 * WALLET.JS
 * =========
 * Handles all MetaMask wallet interactions using Ethers.js.
 *
 * HOW IT WORKS (simplified):
 * ──────────────────────────
 * MetaMask injects a global object called `window.ethereum` into every
 * web page. This object is our bridge to the blockchain.
 *
 * Ethers.js is a library that wraps `window.ethereum` and gives us
 * easy-to-use functions for:
 *   - Connecting to the wallet
 *   - Reading the wallet address
 *   - Checking which network we're on
 *   - Reading the ETH balance
 *   - Sending transactions
 *
 * FLOW:
 * 1. Check if MetaMask is installed (does window.ethereum exist?)
 * 2. Create an ethers "provider" from window.ethereum
 * 3. Call provider.send("eth_requestAccounts") to ask user to connect
 * 4. MetaMask opens a popup → user approves → we get their address
 * 5. Read balance and network info
 * 6. Return all data to checkout.js for display
 *
 * IMPORTANT: This file depends on Ethers.js being loaded BEFORE it runs.
 * The CDN script tag must appear before this file in the HTML.
 */


// =============================================
// SEPOLIA NETWORK CONFIGURATION
// =============================================

/*
 * Sepolia is an Ethereum test network (testnet).
 * It works exactly like the real Ethereum network,
 * but uses fake ETH that has no real value.
 *
 * Each network has a unique "chain ID":
 *   - Ethereum Mainnet: 1
 *   - Sepolia Testnet:  11155111
 *
 * We store these as hex strings because that's
 * what MetaMask expects when switching networks.
 */
const SEPOLIA_CHAIN_ID = '0xaa36a7';  // 11155111 in hexadecimal
const SEPOLIA_CHAIN_ID_DECIMAL = 11155111;


// =============================================
// WALLET STATE
// =============================================

/*
 * We store the wallet state in an object so that
 * checkout.js can easily access all wallet info.
 */
let walletState = {
    isConnected: false,
    address: null,       // Full wallet address (e.g., "0x1a2B...full...9fE3")
    shortAddress: null,  // Truncated (e.g., "0x1a2B...9fE3")
    balance: null,       // Balance in ETH as a string (e.g., "0.500")
    networkName: null,   // Network name (e.g., "Sepolia Testnet")
    isCorrectNetwork: false,  // true if user is on Sepolia
    provider: null,      // Ethers.js provider object
    signer: null         // Ethers.js signer object (used to send transactions)
};


// =============================================
// HELPER: TRUNCATE ADDRESS
// =============================================

/**
 * Shortens a wallet address for display.
 * Example: "0x1a2Bc3Def456789Abcdef0123456789AbcD9fE3"
 *       →  "0x1a2B...9fE3"
 *
 * @param {string} address - The full wallet address
 * @returns {string} - Truncated address
 */
function truncateAddress(address) {
    return address.slice(0, 6) + '...' + address.slice(-4);
}


// =============================================
// CHECK IF METAMASK IS INSTALLED
// =============================================

/**
 * Checks whether MetaMask (or another Ethereum wallet) is
 * installed in the user's browser.
 *
 * MetaMask injects `window.ethereum` when it's installed.
 * If this object doesn't exist, the user needs to install MetaMask.
 *
 * @returns {boolean} - true if MetaMask is available
 */
function isMetaMaskInstalled() {
    // MetaMask injects window.ethereum into pages served over http/https.
    // It does NOT work on file:// URLs — you must use a local server.
    return typeof window.ethereum !== 'undefined';
}


// =============================================
// CONNECT WALLET
// =============================================

/**
 * Main function: connects to the user's MetaMask wallet.
 *
 * Step-by-step:
 * 1. Check if MetaMask is installed
 * 2. Create an ethers.js provider (our connection to the blockchain)
 * 3. Request account access (MetaMask popup appears)
 * 4. Get the signer (represents the connected user)
 * 5. Read the wallet address
 * 6. Check the network (are we on Sepolia?)
 * 7. Read the ETH balance
 * 8. Update walletState with all the info
 * 9. Return the walletState object
 *
 * @returns {object} walletState - Contains all wallet info
 * @throws {Error} - If MetaMask is not installed or user rejects
 */
async function connectWallet() {

    // --- Step 1: Check if MetaMask is installed ---
    if (!isMetaMaskInstalled()) {
        throw new Error(
            'MetaMask is not installed. Please install it from https://metamask.io'
        );
    }

    // --- Step 2: Create an ethers.js provider ---
    /*
     * A "provider" is our read-only connection to the blockchain.
     * We create it from window.ethereum (MetaMask's injected object).
     *
     * ethers.providers.Web3Provider wraps window.ethereum and gives
     * us nice methods like .getBalance(), .getNetwork(), etc.
     */
    const provider = new ethers.providers.Web3Provider(window.ethereum);

    // --- Step 3: Request account access ---
    /*
     * This line triggers the MetaMask popup asking the user:
     * "Do you want to connect this site to your wallet?"
     *
     * If the user clicks "Connect" → we get an array of their addresses.
     * If the user clicks "Cancel" → this throws an error.
     *
     * "eth_requestAccounts" is a standard Ethereum RPC method.
     */
    const accounts = await provider.send('eth_requestAccounts', []);

    /*
     * `accounts` is an array of addresses. We use the first one.
     * Most users only have one account connected at a time.
     */
    const address = accounts[0];

    // --- Step 4: Get the signer ---
    /*
     * A "signer" represents the connected user. Unlike the provider
     * (read-only), the signer can SIGN transactions — meaning it
     * can send ETH on behalf of the user.
     *
     * We'll need the signer later when we implement the Pay button.
     */
    const signer = provider.getSigner();

    // --- Step 5: Check the network ---
    /*
     * Get the network info to check if the user is on Sepolia.
     * network.chainId gives us a number like 11155111 (Sepolia).
     */
    const network = await provider.getNetwork();
    const isCorrectNetwork = network.chainId === SEPOLIA_CHAIN_ID_DECIMAL;

    let networkName;
    if (network.chainId === SEPOLIA_CHAIN_ID_DECIMAL) {
        networkName = 'Sepolia Testnet';
    } else if (network.chainId === 1) {
        networkName = 'Ethereum Mainnet';
    } else {
        networkName = 'Unknown Network (Chain ' + network.chainId + ')';
    }

    // --- Step 6: Read the ETH balance ---
    /*
     * getBalance() returns the balance in "wei" (the smallest ETH unit).
     * 1 ETH = 1,000,000,000,000,000,000 wei (10^18).
     *
     * ethers.utils.formatEther() converts wei to ETH as a string.
     * Example: "500000000000000000" → "0.5"
     */
    const balanceWei = await provider.getBalance(address);
    const balanceEth = ethers.utils.formatEther(balanceWei);

    // --- Step 7: Update wallet state ---
    walletState = {
        isConnected: true,
        address: address,
        shortAddress: truncateAddress(address),
        balance: parseFloat(balanceEth).toFixed(4),
        networkName: networkName,
        isCorrectNetwork: isCorrectNetwork,
        provider: provider,
        signer: signer
    };

    return walletState;
}


// =============================================
// SWITCH TO SEPOLIA NETWORK
// =============================================

/**
 * Asks MetaMask to switch the user to the Sepolia test network.
 *
 * If the user doesn't have Sepolia configured in their MetaMask,
 * we try to add it automatically.
 *
 * @returns {boolean} - true if switch was successful
 */
async function switchToSepolia() {
    try {
        /*
         * wallet_switchEthereumChain asks MetaMask to change networks.
         * We pass the chain ID of Sepolia in hex format.
         */
        await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: SEPOLIA_CHAIN_ID }]
        });
        return true;

    } catch (switchError) {
        /*
         * Error code 4902 means: "This network doesn't exist in the user's MetaMask."
         * In that case, we try to ADD Sepolia to their wallet.
         */
        if (switchError.code === 4902) {
            try {
                await window.ethereum.request({
                    method: 'wallet_addEthereumChain',
                    params: [{
                        chainId: SEPOLIA_CHAIN_ID,
                        chainName: 'Sepolia Testnet',
                        nativeCurrency: {
                            name: 'Sepolia ETH',
                            symbol: 'ETH',
                            decimals: 18
                        },
                        rpcUrls: ['https://rpc.sepolia.org'],
                        blockExplorerUrls: ['https://sepolia.etherscan.io']
                    }]
                });
                return true;
            } catch (addError) {
                console.error('Failed to add Sepolia network:', addError);
                return false;
            }
        }

        console.error('Failed to switch network:', switchError);
        return false;
    }
}


// =============================================
// UPDATE NAVBAR WALLET BUTTON
// =============================================

/**
 * Updates the "Connect Wallet" button in the navbar to show
 * the truncated address after connection.
 *
 * Before: "🔗 Connect Wallet"
 * After:  "🟢 0x1a2B...9fE3"
 */
function updateNavbarWalletButton() {
    const navBtn = document.getElementById('connectWallet');
    if (!navBtn) return;

    if (walletState.isConnected) {
        navBtn.innerHTML = '<span class="status-dot-nav"></span> ' + walletState.shortAddress;
        navBtn.classList.add('wallet-connected-btn');
    }
}


// =============================================
// SEND PAYMENT TRANSACTION
// =============================================

/**
 * Sends a test ETH payment on the Sepolia testnet.
 *
 * HOW ETHEREUM TRANSACTIONS WORK:
 * ─────────────────────────────────
 * A transaction is a signed message that says:
 *   "Send X amount of ETH from my address to this other address."
 *
 * The transaction goes through these stages:
 *   1. CREATED   — We build the transaction object (to, value)
 *   2. SIGNED    — MetaMask signs it with the user's private key
 *   3. BROADCAST — MetaMask sends it to the Ethereum network
 *   4. PENDING   — Miners/validators pick it up and process it
 *   5. CONFIRMED — It's included in a block → done!
 *
 * Each confirmed transaction gets a unique "transaction hash" (tx hash),
 * which is like a receipt number you can look up on Etherscan.
 *
 * WHAT THIS FUNCTION DOES:
 * 1. Build a transaction object with a recipient address and ETH amount
 * 2. Call signer.sendTransaction() — this opens MetaMask for approval
 * 3. Wait for the transaction to be mined (confirmed on the blockchain)
 * 4. Return the transaction hash
 *
 * @param {string} amountInEth - Amount to send, e.g., "0.015"
 * @param {function} [onProgress] - Optional callback for progress updates.
 *   Called with (stage, data) where stage is:
 *     'approve'   — Waiting for user to approve in MetaMask
 *     'broadcast'  — Transaction signed and sent to network
 *     'confirmed'  — Transaction mined and confirmed
 * @returns {object} - { success, txHash, error }
 */
async function sendPayment(amountInEth, onProgress) {

    // --- Safety check: wallet must be connected ---
    if (!walletState.isConnected || !walletState.signer) {
        return {
            success: false,
            txHash: null,
            error: 'Wallet is not connected. Please connect first.'
        };
    }

    // --- Safety check: must be on Sepolia ---
    if (!walletState.isCorrectNetwork) {
        return {
            success: false,
            txHash: null,
            error: 'Please switch to the Sepolia test network.'
        };
    }

    try {
        // --- Step 1: Build the transaction object ---
        /*
         * Every Ethereum transaction needs at minimum:
         *   - `to`:    The recipient address (who gets the ETH)
         *   - `value`: The amount in wei (smallest ETH unit)
         *
         * RECIPIENT ADDRESS:
         * In a real app, this would be your company's wallet address.
         * For this learning project, we use a commonly-known "burn"
         * address. Any ETH sent here is effectively gone — but since
         * it's test ETH on Sepolia, that's fine!
         *
         * You can replace this with your own wallet address if you
         * want to receive the test ETH instead.
         */
        const RECIPIENT_ADDRESS = '0x04d4DA8938e56C954DCf2Fa4d649B143e8F9541A';

        /*
         * ethers.utils.parseEther() converts a human-readable ETH
         * string into wei (the unit the blockchain actually uses).
         *
         * Example: "0.015" → "15000000000000000" (in wei)
         *
         * This is the reverse of formatEther() which we used earlier
         * to display the balance.
         */
        const amountInWei = ethers.utils.parseEther(amountInEth);

        /*
         * The transaction object:
         *   - `to`:    Where to send the ETH
         *   - `value`: How much to send (in wei)
         *
         * We don't set `gasLimit` or `gasPrice` — MetaMask will
         * calculate these automatically based on current network
         * conditions. The user can see and adjust them in the
         * MetaMask popup.
         */
        const transaction = {
            to: RECIPIENT_ADDRESS,
            value: amountInWei
        };

        console.log('Sending transaction:', {
            to: RECIPIENT_ADDRESS,
            amount: amountInEth + ' ETH',
            amountWei: amountInWei.toString()
        });

        // Notify: waiting for MetaMask approval
        if (onProgress) onProgress('approve');

        // --- Step 2: Send the transaction ---
        /*
         * signer.sendTransaction() does three things:
         *
         * 1. It opens the MetaMask popup showing:
         *    - From: your address
         *    - To: the recipient address
         *    - Amount: 0.015 ETH
         *    - Gas fee: (calculated by MetaMask)
         *
         * 2. The user clicks "Confirm" in MetaMask
         *    (or "Reject" → throws an error)
         *
         * 3. MetaMask signs the transaction with the user's
         *    private key and broadcasts it to the network
         *
         * The returned `tx` object contains:
         *    - tx.hash: The transaction hash (receipt number)
         *    - tx.wait(): A function to wait for confirmation
         */
        const tx = await walletState.signer.sendTransaction(transaction);

        console.log('Transaction broadcast! Hash:', tx.hash);
        console.log('Waiting for confirmation...');

        // Notify: transaction broadcast, waiting for mining
        if (onProgress) onProgress('broadcast', tx.hash);

        // --- Step 3: Wait for the transaction to be mined ---
        /*
         * tx.wait() pauses execution until the transaction is
         * included in a block on the blockchain.
         *
         * On Sepolia, this usually takes 12-15 seconds
         * (one block time).
         *
         * The returned `receipt` object contains:
         *   - receipt.status: 1 = success, 0 = failed
         *   - receipt.blockNumber: which block it was included in
         *   - receipt.transactionHash: same as tx.hash
         *   - receipt.gasUsed: how much gas was consumed
         */
        const receipt = await tx.wait();

        console.log('Transaction confirmed!', {
            hash: receipt.transactionHash,
            block: receipt.blockNumber,
            status: receipt.status,
            gasUsed: receipt.gasUsed.toString()
        });

        // Notify: transaction confirmed
        if (onProgress) onProgress('confirmed');

        // --- Step 4: Return success with the tx hash ---
        /*
         * receipt.status === 1 means the transaction succeeded.
         * We return the hash so checkout.js can:
         *   1. Save it to sessionStorage
         *   2. Pass it to the confirmation page
         *   3. Show a link to view it on Etherscan
         */
        if (receipt.status === 1) {
            return {
                success: true,
                txHash: receipt.transactionHash,
                error: null
            };
        } else {
            return {
                success: false,
                txHash: receipt.transactionHash,
                error: 'Transaction failed on-chain. Check Etherscan for details.'
            };
        }

    } catch (error) {
        /*
         * Common errors:
         *
         * error.code === 4001
         *   → User clicked "Reject" in MetaMask popup
         *
         * error.code === 'INSUFFICIENT_FUNDS'
         *   → User doesn't have enough ETH (including gas fees)
         *
         * error.code === 'NETWORK_ERROR'
         *   → Network connectivity issue
         */
        console.error('Payment error:', error);

        let errorMessage;

        if (error.code === 4001 || error.code === 'ACTION_REJECTED') {
            errorMessage = 'Transaction rejected. You cancelled the payment in MetaMask.';
        } else if (error.code === 'INSUFFICIENT_FUNDS') {
            errorMessage = 'Insufficient funds. You need more Sepolia test ETH. Get free test ETH from a Sepolia faucet.';
        } else {
            errorMessage = 'Payment failed: ' + (error.reason || error.message);
        }

        return {
            success: false,
            txHash: null,
            error: errorMessage
        };
    }
}
