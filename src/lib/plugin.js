"use strict"

const debug = require("debug")("plugin-transburn");
const EventEmitter2 = require("eventemitter2").EventEmitter2;
const Web3 = require("web3");
const Tx = require('ethereumjs-tx').Transaction;
const Common =require('ethereumjs-common').default;

const abi = require("../abi/SanpoToken.json");
const createWebsocketProvider = (provider) => new Web3.providers.WebsocketProvider(provider, {
  clientConfig: {
    maxReceivedFrameSize: 100000000,
    maxReceivedMessageSize: 100000000,
  }
});
const uuidToHex = (uuid) => "0x" + uuid.replace(/-/g, "");
const isoToHex = (web3, iso) => web3.utils.toHex(Math.round((new Date(iso)).getTime() / 1000));
const packetToData = (packet) => "0x" + Buffer.from(packet, "base64").toString("hex");
const customCommon = Common.forCustomChain(
  'mainnet',
  {
    name: 'privatechain',
    networkId: 1,
    chainId: 11421,
  },
  'petersburg',
)

class PluginSpt extends EventEmitter2 {
  constructor(opts) {
    super();
    this._primaryProvider = opts.provider;
    this._secondaryProvider = opts.altProvider || opts.provider;
    this.provider = this._primaryProvider;
    this.address = opts.address;
    this.privateKey = opts.privateKey;
    this.web3 = null;
    this.isBeating = false;
    this.contractAddress = opts.contractAddress;
  }

  async connect() {
    debug("connect... " + this.provider);

    if (!this.isBeating) {
      this._heartbeat();
    }
    this.isBeating = true;

    this.web3 = new Web3(createWebsocketProvider(this.provider));
    this.web3.eth.handleRevert = true;
    this.contract = new this.web3.eth.Contract(abi, this.contractAddress);

    debug("registering Transfer event handler");
    this.contract.events.Transfer()
    .on("data", (event) => {
      debug("Transfer event:", event);
    });

    debug("registering Transburn event handler");
    this.contract.events.Transburn()
    .on("data", (event) => {
      debug("Transburn event:", event);
    });

    debug("registering Approval event handler");
    this.contract.events.Approval()
    .on("data", (event) => {
      debug("Approval event:", event);
    });

    debug("registering ProposeVoting event handler");
    this.contract.events.ProposeVoting()
    .on("data", (event) => {
      debug("ProposeVoting event:", event);
    });

    debug("registering Vote event handler");
    this.contract.events.Vote()
    .on("data", (event) => {
      debug("Vote event:", event);
    });

    debug("registering FinalizeVoting event handler");
    this.contract.events.FinalizeVoting()
    .on("data", (event) => {
      debug("FinalizeVoting event:", event);
    });

    debug("registering CancelVoting event handler");
    this.contract.events.CancelVoting()
    .on("data", (event) => {
      debug("CancelVoting event:", event);
    });
  }

  disconnect() {
    if (!this.web3) return;
    this.web3.currentProvider.disconnect();
    this.web3 = null;
  }

  _heartbeat() {
    setInterval(() => {
      /**
       * Handle web socket disconnects
       * @see https://github.com/ethereum/web3.js/issues/1354
       * @see https://github.com/ethereum/web3.js/issues/1933
       * It also serves as a heartbeat to node
       */
      if (this.web3) {
        this.web3.eth.net.isListening().catch((e) => {
          debug("disconnected " + this.provider);
          this.web3.currentProvider.disconnect();
          this.web3 = null;
          if (this.provider === this._primaryProvider) {
            this.provider = this._secondaryProvider;
          } else {
            this.provider = this._primaryProvider;
          }
          const provider = createWebsocketProvider(this.provider);
          provider.on("connect", () => {
            this.connect();
          });
        });
      }

      // reconnect
      if (!this.web3) {
        if (this.provider === this._primaryProvider) {
          this.provider = this._secondaryProvider;
        } else {
          this.provider = this._primaryProvider;
        }
        debug("Attempting to reconnect... " + this.provider);
        const provider = createWebsocketProvider(this.provider);
        provider.on("connect", () => {
          this.connect();
        })
      }
    }, 5 * 1000);
  }

  transfer(to, amount) {
    const txData = this.contract.methods.transfer(
      to,
      this.web3.utils.toWei(amount),
    ).encodeABI();
    return this._sendSignedTransaction(this.contract, this.address, this.privateKey, txData);
  }

  allowance(owner, spender) {
    return new Promise(resolve => {
      this.contract.methods.allowance(owner, spender).call().then(result => {
        resolve(
          { allowance: result }
        );
      });
    });
  }

  approve(spender, amount) {
    const txData = this.contract.methods.approve(
      spender,
      this.web3.utils.toWei(amount),
    ).encodeABI();
    return this._sendSignedTransaction(this.contract, this.address, this.privateKey, txData);
  }

  transferFrom(from, to, amount) {
    const txData = this.contract.methods.transferFrom(
      from,
      to,
      this.web3.utils.toWei(amount),
    ).encodeABI();
    return this._sendSignedTransaction(this.contract, this.address, this.privateKey, txData);
  }

  proposeVoting(votingName, proposalRate, startDate) {
    const txData = this.contract.methods.proposeVoting(
      votingName,
      proposalRate,
      startDate,
    ).encodeABI();
    return this._sendSignedTransaction(this.contract, this.address, this.privateKey, txData);
  }

  vote(voteId) {
    const txData = this.contract.methods.vote(
      voteId,
    ).encodeABI();
    return this._sendSignedTransaction(this.contract, this.address, this.privateKey, txData);
  }

  finalizeVoting(voteId) {
    const txData = this.contract.methods.finalizeVoting(
      voteId,
    ).encodeABI();
    return this._sendSignedTransaction(this.contract, this.address, this.privateKey, txData);
  }

  cancelVoting(voteId) {
    const txData = this.contract.methods.cancelVoting(
      voteId,
    ).encodeABI();
    return this._sendSignedTransaction(this.contract, this.address, this.privateKey, txData);
  }

  name() {
    return new Promise(resolve => {
      this.contract.methods.name().call().then(result => {
        resolve(
          { name: result }
        );
      });
    });
  }

  symbol() {
    return new Promise(resolve => {
      this.contract.methods.symbol().call().then(result => {
        resolve(
          { symbol: result }
        );
      });
    });
  }

  decimals() {
    return new Promise(resolve => {
      this.contract.methods.decimals().call().then(result => {
        resolve(
          { decimals: result }
        );
      });
    });
  }

  totalSupply() {
    return new Promise(resolve => {
      this.contract.methods.totalSupply().call().then(result => {
        resolve(
          { totalSupply: result }
        );
      });
    });
  }

  balanceOf(address) {
    return new Promise(resolve => {
      this.contract.methods.balanceOf(address).call().then(result => {
        resolve(
          { balance: result }
        );
      });
    });
  }

  burnRateOf() {
    return new Promise(resolve => {
      this.contract.methods.burnRateOf().call().then(result => {
        resolve(
          { burnRate: result }
        );
      });
    });
  }

  historicalBurnRateOf() {
    return new Promise(resolve => {
      this.contract.methods.historicalBurnRateOf().call().then(result => {
        resolve(
          { historicalBurnRate: result }
        );
      });
    });
  }

  voting(voteId) {
    return new Promise(resolve => {
      this.contract.methods.voting(voteId).call().then(result => {
        resolve(
          { voter: result }
        );
      });
    });
  }

  voter(voteId, voter) {
    return new Promise(resolve => {
      this.contract.methods.voter(voteId, voter).call().then(result => {
        resolve(
          { voter: result }
        );
      });
    });
  }

  votedsList(voteId) {
    return new Promise(resolve => {
      this.contract.methods.votedsList(voteId).call().then(result => {
        resolve(
          { voteds: result }
        );
      });
    });
  }

  votingHistoryOf(user) {
    return new Promise(resolve => {
      this.contract.methods.votingHistoryOf(user).call().then(result => {
        resolve(
          { votingHistory: result }
        );
      });
    });
  }

  amountLockDueDate(voter) {
    return new Promise(resolve => {
      this.contract.methods.amountLockDueDate(voter).call().then(result => {
        resolve(
          { amountLockDueDate: result }
        );
      });
    });
  }

  historicalProposedRateOf() {
    return new Promise(resolve => {
      this.contract.methods.historicalProposedRateOf().call().then(result => {
        resolve(
          { amountLockDueDate: result }
        );
      });
    });
  }

  getBlock(blockHashOrBlockNumber) {
    return this.web3.eth.getBlock(blockHashOrBlockNumber);
  }

  fromWei(value) {
    return this.web3.utils.fromWei(value, 'ether');
  }

  async _sendSignedTransaction(_contract, _from, _privateKey, _txData) {
    const nonce = await this.web3.eth.getTransactionCount(_from, "pending");
    const rawTx = {
      from: _from,
      to: _contract.options.address,
      gas: 4700000,
      gasPrice: 0,
      data: _txData,
      nonce: nonce,
    };
    const tx = new Tx(rawTx, { common: customCommon });
    tx.sign(Buffer.from(_privateKey.split("0x")[1], "hex"));
    const serializedTx = tx.serialize();

    return new Promise((resolve, reject) => {
      this.web3.eth.sendSignedTransaction("0x" + serializedTx.toString("hex"))
      .on("confirmation", (confirmationNumber, receipt) => {
        if (confirmationNumber === 1) {
          resolve(receipt.transactionHash);
        }
      })
      .on("error", (error) =>  {
        console.error;
        reject(error);
      })
    });
  }
}

module.exports = PluginSpt
