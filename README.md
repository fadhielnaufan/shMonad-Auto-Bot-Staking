# shMonad Auto Bot Staking

A Node.js script that automates the conversion between MON and shMON tokens on the Monad Testnet, allowing for periodic staking and unstaking operations.

## Features

- Convert MON to shMON (staking)
- Convert shMON back to MON (unstaking)
- Automated periodic conversion cycles
- Balance checking
- Gas configuration optimized for Monad Testnet
- Interactive menu system

## Prerequisites

- Node.js (v18 or higher recommended)
- npm or yarn
- A Monad Testnet wallet with MON tokens
- RPC URL for Monad Testnet (included in script)

## Installation

1. Clone this repository or download the script file.
```
git clone https://github.com/fadhielnaufan/shMonad-Auto-Bot-Staking.git
```

2. Install the required dependencies:
```bash
npm install ethers dotenv readline
```

3. Create a `.env` file in the same directory with your private key:
```
PRIVATE_KEY=your_private_key_here
```

**WARNING:** Never commit your `.env` file or share your private key. Add `.env` to your `.gitignore`.

## Usage

1. Run the script:
```bash
node Autobot_shMonad.js
```

2. The interactive menu will appear with the following options:

```
1. Show Current Balances
2. Setup Auto-Swap Configuration
3. Start Auto-Swap
4. Stop Auto-Swap
5. Show Auto-Swap Status
6. Exit
```

### Menu Options Explained

1. **Show Current Balances**: Displays your MON and shMON balances.
2. **Setup Auto-Swap Configuration**: Configure amounts and delays for automatic conversions.
3. **Start Auto-Swap**: Begin the automated conversion cycle with your configured settings.
4. **Stop Auto-Swap**: Gracefully stop the automated conversion cycle.
5. **Show Auto-Swap Status**: View current configuration and status of auto-swap.
6. **Exit**: Quit the application.

### Auto-Swap Configuration

When setting up auto-swap, you'll need to provide:
- Amount of MON to convert to shMON
- Amount of shMON to convert back to MON (or "all" for full balance)
- Delay (in minutes) after MON→shMON conversion
- Delay (in minutes) after shMON→MON conversion

The script will then cycle continuously between these operations with your specified delays.

## Configuration

The script includes several configuration options at the top of the file:

```javascript
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
```

You can modify these values if the network parameters change.

## Security Considerations

- This script handles your private key. Always review the code before running it.
- The script is configured for Monad Testnet. Do not use it with mainnet assets unless you've verified all parameters.
- Keep your `.env` file secure and never share it.

## License

This project is unlicensed. Use at your own risk.

## Disclaimer

This software is provided "as is" without warranty of any kind. The author is not responsible for any losses incurred through use of this script. Always test with small amounts first.

Regards Fadhiel Naufan @ 2025
