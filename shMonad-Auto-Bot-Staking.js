require('dotenv').config();
const { ethers } = require('ethers');
const readline = require('readline');

// Monad Network Configuration
const monadNetwork = {
  name: "Monad Testnet",
  chainId: 10143,
  rpcUrl: "https://testnet-rpc.monad.xyz",
  symbol: "MON",
  explorer: "https://testnet.monadexplorer.com",
  contracts: {
    staking: "0x3a98250F98Dd388C211206983453837C8365BDc1"
  }
};

// Gas configuration from successful tx
const gasConfig = {
  maxFeePerGas: ethers.parseUnits('52', 'gwei'),
  maxPriorityFeePerGas: ethers.parseUnits('2', 'gwei'),
  gasLimit: 60000n
};

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const provider = new ethers.JsonRpcProvider(monadNetwork.rpcUrl, {
  chainId: monadNetwork.chainId,
  name: monadNetwork.name
});
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

// Complete ABI for both conversions
const stakingAbi = [
  // ERC-20 functions for shMON
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  
  // Deposit function (MON → shMON)
  {
    "inputs": [
      {"internalType": "uint256", "name": "assets", "type": "uint256"},
      {"internalType": "address", "name": "receiver", "type": "address"}
    ],
    "name": "deposit",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "payable",
    "type": "function"
  },
  
  // Withdraw function (shMON → MON)
  {
    "inputs": [
      {"internalType": "uint256", "name": "shares", "type": "uint256"},
      {"internalType": "address", "name": "receiver", "type": "address"},
      {"internalType": "address", "name": "owner", "type": "address"}
    ],
    "name": "redeem",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  
  // Events
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event Deposit(address indexed caller, address indexed owner, uint256 assets, uint256 shares)",
  "event Withdraw(address indexed caller, address indexed receiver, address indexed owner, uint256 assets, uint256 shares)"
];

const stakingContract = new ethers.Contract(
  monadNetwork.contracts.staking,
  stakingAbi,
  wallet
);

// Configuration for auto-swap
let autoSwapConfig = {
  isRunning: false,
  monToShmonAmount: "0",
  shmonToMonAmount: "0",
  monToShmonDelayMinutes: 180, // Default: 3 hours
  shmonToMonDelayMinutes: 360, // Default: 6 hours
  currentOperation: null,
  stopRequested: false
};

async function showBalances() {
  try {
    const [nativeBalance, shMONBalance, decimals] = await Promise.all([
      provider.getBalance(wallet.address),
      stakingContract.balanceOf(wallet.address),
      stakingContract.decimals()
    ]);
    
    console.log('\nCurrent Balances:');
    console.log('-----------------');
    console.log(`Native MON Balance: ${ethers.formatEther(nativeBalance)} MON`);
    console.log(`shMON Token Balance: ${ethers.formatUnits(shMONBalance, decimals)} shMON`);
    console.log(`Wallet Address: ${wallet.address}\n`);
    
    return {
      nativeBalance,
      nativeBalanceFormatted: ethers.formatEther(nativeBalance),
      shMONBalance,
      shMONBalanceFormatted: ethers.formatUnits(shMONBalance, decimals),
      decimals: decimals
    };
  } catch (error) {
    console.error('Error fetching balances:', error.message);
    return null;
  }
}

async function checkAllowance() {
  try {
    const allowance = await stakingContract.allowance(wallet.address, monadNetwork.contracts.staking);
    return allowance;
  } catch (error) {
    console.error('Error checking allowance:', error.message);
    return ethers.Zero;
  }
}

async function approveUnlimited() {
  try {
    console.log('Approving unlimited shMON spending...');
    const tx = await stakingContract.approve(
      monadNetwork.contracts.staking,
      ethers.MaxUint256, // Unlimited approval
      {
        maxFeePerGas: gasConfig.maxFeePerGas,
        maxPriorityFeePerGas: gasConfig.maxPriorityFeePerGas,
        gasLimit: gasConfig.gasLimit
      }
    );
    
    console.log(`Approval tx sent: ${monadNetwork.explorer}/tx/${tx.hash}`);
    await tx.wait();
    console.log('Unlimited approval granted!');
    return true;
  } catch (error) {
    console.error('Approval failed:', error.message);
    return false;
  }
}

async function depositMON(amount) {
  const balances = await showBalances();
  if (!balances) return false;
  
  try {
    const amountWei = ethers.parseEther(amount);
    
    // Check if we have enough balance
    if (amountWei > balances.nativeBalance) {
      console.error(`\nInsufficient MON balance. Available: ${balances.nativeBalanceFormatted}`);
      return false;
    }
    
    console.log('\nTransaction Details:');
    console.log(`Converting: ${amount} MON to shMON`);
    console.log(`Receiver: ${wallet.address}`);
    console.log(`Gas Limit: ${gasConfig.gasLimit.toString()}`);
    
    const tx = await stakingContract.deposit(
      amountWei,
      wallet.address,
      {
        maxFeePerGas: gasConfig.maxFeePerGas,
        maxPriorityFeePerGas: gasConfig.maxPriorityFeePerGas,
        gasLimit: gasConfig.gasLimit,
        value: amountWei // Send MON with the transaction
      }
    );
    
    console.log(`\nTransaction sent: ${monadNetwork.explorer}/tx/${tx.hash}`);
    console.log('Waiting for confirmation...');
    
    const receipt = await tx.wait();
    
    const transferEvent = receipt.logs.find(log => 
      log.topics[0] === ethers.id("Transfer(address,address,uint256)") &&
      log.topics[1] === ethers.zeroPadValue("0x0000000000000000000000000000000000000000", 32)
    );
    
    if (transferEvent) {
      const decoded = stakingContract.interface.decodeEventLog(
        "Transfer",
        transferEvent.data,
        transferEvent.topics
      );
      console.log(`Success! Received ${ethers.formatUnits(decoded.value, balances.decimals)} shMON`);
    } else {
      console.log('Conversion successful!');
    }
    return true;
  } catch (error) {
    console.error('\nConversion failed:', error.message);
    if (error.reason) {
      console.log('Reason:', error.reason);
    }
    return false;
  }
}

async function redeemSHMON(amount) {
  const balances = await showBalances();
  if (!balances) return false;
  
  // Check allowance first
  const allowance = await checkAllowance();
  if (allowance === ethers.Zero) {
    console.log('\nYou need to approve shMON spending first');
    if (!await approveUnlimited()) {
      return false;
    }
  }
  
  try {
    let amountWei;
    if (amount.toLowerCase() === 'all') {
      amountWei = balances.shMONBalance;
    } else {
      amountWei = ethers.parseUnits(amount, balances.decimals);
    }
    
    // Check if we have enough balance
    if (amountWei > balances.shMONBalance) {
      console.error(`\nInsufficient shMON balance. Available: ${balances.shMONBalanceFormatted}`);
      return false;
    }
    
    console.log('\nTransaction Details:');
    console.log(`Converting: ${ethers.formatUnits(amountWei, balances.decimals)} shMON to MON`);
    console.log(`Receiver: ${wallet.address}`);
    console.log(`Gas Limit: ${gasConfig.gasLimit.toString()}`);
    
    const tx = await stakingContract.redeem(
      amountWei,
      wallet.address, // receiver
      wallet.address, // owner
      {
        maxFeePerGas: gasConfig.maxFeePerGas,
        maxPriorityFeePerGas: gasConfig.maxPriorityFeePerGas,
        gasLimit: gasConfig.gasLimit
      }
    );
    
    console.log(`\nTransaction sent: ${monadNetwork.explorer}/tx/${tx.hash}`);
    console.log('Waiting for confirmation...');
    
    const receipt = await tx.wait();
    
    const withdrawEvent = receipt.logs.find(log => 
      log.topics[0] === ethers.id("Withdraw(address,address,address,uint256,uint256)")
    );
    
    if (withdrawEvent) {
      const decoded = stakingContract.interface.decodeEventLog(
        "Withdraw",
        withdrawEvent.data,
        withdrawEvent.topics
      );
      console.log(`Success! Received ${ethers.formatUnits(decoded.assets, balances.decimals)} MON`);
    } else {
      console.log('Conversion successful!');
    }
    return true;
  } catch (error) {
    console.error('\nConversion failed:', error.message);
    if (error.reason) {
      console.log('Reason:', error.reason);
    }
    return false;
  }
}

// Sleep function for delays (in minutes)
function sleep(minutes) {
  return new Promise(resolve => {
    const ms = minutes * 60 * 1000;
    const startTime = Date.now();
    const endTime = startTime + ms;
    
    console.log(`\nWaiting for ${minutes} minutes...`);
    
    const interval = setInterval(() => {
      const remaining = Math.ceil((endTime - Date.now()) / (60 * 1000));
      process.stdout.write(`\rRemaining time: ${remaining} minutes     `);
      
      if (autoSwapConfig.stopRequested) {
        clearInterval(interval);
        console.log('\nOperation canceled by user.');
        resolve(false);
      }
    }, 60000); // Update every minute
    
    setTimeout(() => {
      clearInterval(interval);
      console.log('\nWait completed!');
      resolve(true);
    }, ms);
  });
}

async function startAutoSwap() {
  if (autoSwapConfig.isRunning) {
    console.log('\nAuto-swap is already running!');
    return;
  }
  
  autoSwapConfig.isRunning = true;
  autoSwapConfig.stopRequested = false;
  
  console.log('\n===== STARTING AUTO SWAP CYCLE =====');
  console.log(`MON to shMON amount: ${autoSwapConfig.monToShmonAmount} MON`);
  console.log(`shMON to MON amount: ${autoSwapConfig.shmonToMonAmount === 'all' ? 'ALL' : autoSwapConfig.shmonToMonAmount + ' shMON'}`);
  console.log(`MON → shMON delay: ${autoSwapConfig.monToShmonDelayMinutes} minutes`);
  console.log(`shMON → MON delay: ${autoSwapConfig.shmonToMonDelayMinutes} minutes`);
  
  while (autoSwapConfig.isRunning && !autoSwapConfig.stopRequested) {
    try {
      // Step 1: MON to shMON
      autoSwapConfig.currentOperation = 'MON to shMON';
      console.log('\n----- CYCLE: Converting MON to shMON -----');
      const depositSuccess = await depositMON(autoSwapConfig.monToShmonAmount);
      if (!depositSuccess) {
        console.log('Stopping auto-swap due to deposit failure.');
        break;
      }
      
      // Step 2: Wait for the configured delay
      console.log(`\nWaiting for ${autoSwapConfig.monToShmonDelayMinutes} minutes before converting back to MON...`);
      const continueAfterDelay1 = await sleep(autoSwapConfig.monToShmonDelayMinutes);
      if (!continueAfterDelay1) break;
      
      // Step 3: shMON to MON
      autoSwapConfig.currentOperation = 'shMON to MON';
      console.log('\n----- CYCLE: Converting shMON to MON -----');
      const redeemSuccess = await redeemSHMON(autoSwapConfig.shmonToMonAmount);
      if (!redeemSuccess) {
        console.log('Stopping auto-swap due to redeem failure.');
        break;
      }
      
      // Step 4: Wait before starting the next cycle
      console.log(`\nWaiting for ${autoSwapConfig.shmonToMonDelayMinutes} minutes before starting next cycle...`);
      const continueAfterDelay2 = await sleep(autoSwapConfig.shmonToMonDelayMinutes);
      if (!continueAfterDelay2) break;
      
      console.log('\n===== STARTING NEW CYCLE =====');
    } catch (error) {
      console.error('\nError in auto-swap cycle:', error);
      console.log('Waiting 1 minute before retrying...');
      await sleep(1);
    }
  }
  
  autoSwapConfig.isRunning = false;
  autoSwapConfig.currentOperation = null;
  console.log('\nAuto-swap stopped.');
  showMenu();
}

function stopAutoSwap() {
  if (!autoSwapConfig.isRunning) {
    console.log('\nAuto-swap is not running.');
    return;
  }
  
  console.log('\nStopping auto-swap after current operation completes...');
  autoSwapConfig.stopRequested = true;
}

function setupAutoSwap() {
  rl.question('\nEnter amount of MON to convert to shMON: ', (monAmount) => {
    autoSwapConfig.monToShmonAmount = monAmount;
    
    rl.question('Enter amount of shMON to convert back to MON (or "all" for all balance): ', (shmonAmount) => {
      autoSwapConfig.shmonToMonAmount = shmonAmount;
      
      rl.question('Enter delay (in minutes) after MON to shMON conversion: ', (delay1) => {
        autoSwapConfig.monToShmonDelayMinutes = parseInt(delay1);
        
        rl.question('Enter delay (in minutes) after shMON to MON conversion: ', (delay2) => {
          autoSwapConfig.shmonToMonDelayMinutes = parseInt(delay2);
          
          console.log('\nAuto-swap configuration complete!');
          console.log(`MON to shMON amount: ${autoSwapConfig.monToShmonAmount} MON`);
          console.log(`shMON to MON amount: ${autoSwapConfig.shmonToMonAmount === 'all' ? 'ALL' : autoSwapConfig.shmonToMonAmount + ' shMON'}`);
          console.log(`MON → shMON delay: ${autoSwapConfig.monToShmonDelayMinutes} minutes`);
          console.log(`shMON → MON delay: ${autoSwapConfig.shmonToMonDelayMinutes} minutes`);
          
          rl.question('\nStart auto-swap now? (y/n): ', (answer) => {
            if (answer.toLowerCase() === 'y') {
              startAutoSwap();
            } else {
              showMenu();
            }
          });
        });
      });
    });
  });
}

function showAutoSwapStatus() {
  console.log('\nAuto-Swap Status:');
  console.log('-----------------');
  console.log(`Running: ${autoSwapConfig.isRunning ? 'Yes' : 'No'}`);
  
  if (autoSwapConfig.isRunning) {
    console.log(`Current operation: ${autoSwapConfig.currentOperation}`);
    console.log(`MON to shMON amount: ${autoSwapConfig.monToShmonAmount} MON`);
    console.log(`shMON to MON amount: ${autoSwapConfig.shmonToMonAmount === 'all' ? 'ALL' : autoSwapConfig.shmonToMonAmount + ' shMON'}`);
    console.log(`MON → shMON delay: ${autoSwapConfig.monToShmonDelayMinutes} minutes`);
    console.log(`shMON → MON delay: ${autoSwapConfig.shmonToMonDelayMinutes} minutes`);
  }
  
  showMenu();
}

function showMenu() {
  console.log(
    "         __    __  ___                      __\n" +
    "   _____/ /_  /  |/  /___  ____  ____ _____/ /\n" +
    "  / ___/ __ \\/ /|_/ / __ \\/ __ \\/ __ `/ __  / \n" +
    " (__  ) / / / /  / / /_/ / / / / /_/ / /_/ /  \n" +
    "/____/_/ /_/_/  /_/\\____/_/ /_/\\__,_/\\__,_/   \n" +
    "                        by Fadhiel Naufan       "
    );
  console.log('1. Show Current Balances');
  console.log('2. Setup Auto-Swap Configuration');
  console.log('3. Start Auto-Swap');
  console.log('4. Stop Auto-Swap');
  console.log('5. Show Auto-Swap Status');
  console.log('6. Exit');
  
  rl.question('Select an option (1-6): ', (choice) => {
    switch (choice) {
      case '1':
        showBalances().then(() => showMenu());
        break;
      case '2':
        setupAutoSwap();
        break;
      case '3':
        startAutoSwap();
        break;
      case '4':
        stopAutoSwap();
        showMenu();
        break;
      case '5':
        showAutoSwapStatus();
        break;
      case '6':
        console.log('Exiting...');
        rl.close();
        process.exit(0);
      default:
        console.log('Invalid option');
        showMenu();
    }
  });
}

// Start
console.log('Monad Auto Staking Bot');
console.log(`Connected to ${wallet.address}`);
showBalances().then(() => showMenu());