import { Presale } from './../typechain/Presale.d';
import { DATToken } from './../typechain/DATToken.d';
import { IERC20 } from './../typechain/IERC20.d';
import { IUniswapV2Router02 } from './../typechain/IUniswapV2Router02.d';
import { toWei, deployer, setDefaultSigner, advanceTimeAndBlock, getCurrentTime, toBN } from "../utils";
import { ethers, waffle } from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import { SignerWithAddress } from 'hardhat-deploy-ethers/dist/src/signers';
import { BigNumber } from '@ethersproject/bignumber';

chai.use(solidity);
const { expect } = chai;

/*
  * user[0]: Deployer / Owner of all contracts.
  * user[1]: Team wallet. Owns 7% of total supply. Must have time lock. 
  * user[2]: Community development wallet. Owns 9% of total supply. Must have time lock.
  * user[3]: Dev wallet. Where 10% of distributed BTCB get collected. Should have multisig
  * user[4]: Dev wallet for Presale. Where all BNBs get collected from presale. Should have multisig. 
  * user[10]: Normal user: Alice
  * user[11]: Normal user: Bob
  * user[12]: Normal user: Charile
  * user[13]: Normals user: David
  * user[14]: Normals user: Eric
  */

describe("Final Test", () => {
  let users: SignerWithAddress[];
  let owner: SignerWithAddress;
  let team: SignerWithAddress;
  let community: SignerWithAddress;
  let dev: SignerWithAddress;
  let presaleWallet: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let charile: SignerWithAddress;
  let david: SignerWithAddress;
  let eric: SignerWithAddress;
  let usersAddr: string[];

  let dat: DATToken;
  let presale: Presale;
  let btcb: IERC20;
  let router: IUniswapV2Router02;

  let totalSupply: BigNumber;
  let rate: number;

  let pathBuy: string[] = new Array();
  let pathSell: string[] = new Array();
  const deadlineLong = (1909988180).toString(); //in 2030

  before(async () => {
    //Set accounts
    users = await ethers.getSigners();
    usersAddr = users.map(_user => _user.address);
    owner = users[0];
    team = users[1];
    community = users[2];
    dev = users[3];
    presaleWallet = users[4];
    alice = users[10];
    bob = users[11];
    charile = users[12];
    david = users[13];
    eric = users[14];

    //Set default signer 
    setDefaultSigner(owner);

    //Connect to pancake router contract
    const routerAddr = "0x10ED43C718714eb63d5aA57B78B54704E256024E";
    router = await ethers.getContractAt("IUniswapV2Router02", routerAddr);
    //Connect to BTCB contract
    const btcbAddr = "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c";
    btcb = await ethers.getContractAt("IERC20", btcbAddr);

    //Set Token contract args
    const name = "DontApeThis";
    const symbol = "DAT";
    const totalSupply = toBN(10**10) //NO DECIMAL
    const decimals = "18";
    const reflectionFee = "15";
    const swapFee = "135";

    //Deploy DAT token
    dat = await deployer("DATToken", name, symbol, totalSupply, decimals, reflectionFee, swapFee) as DATToken;

    //Set swap paths
    pathBuy[0] = await router.WETH();
    pathBuy[1] = dat.address;
    pathSell[0] = dat.address;
    pathSell[1] = await router.WETH();

    //Set Presale contract args
    rate = (300_000); //1BNB = 300,000 DAT tokens
    const wallet = presaleWallet.address;
    const token = dat.address;
    const _rate = toBN(rate);
    const openingTime = toBN(getCurrentTime(1000)); //now + 1000sec
    const closingTime = toBN(getCurrentTime(10000)); //now + 10000sec
    const minBuyLimit = toWei(0.1); //0.1 BNB
    const maxDiscount = toWei(3); //3 BNB
    const maxBounsPercentage = "25"; //25%

    //Deploy Presale
    presale = (await deployer("Presale", token, wallet, _rate, openingTime, closingTime, minBuyLimit, maxDiscount, maxBounsPercentage)) as Presale;
  });

  describe("Basic token test", async () => {
    it("Should display metadata and basic info correctly", async () => {
      totalSupply = await dat.totalSupply();
      const tenBillion = toWei(10**10);
  
      expect(await dat.name()).to.equal("DontApeThis");
      expect(await dat.symbol()).to.equal("DAT");
      expect(totalSupply).to.equal(tenBillion);
    });
  
    it("Community wallet should get 9% and team wallet should get 7% of totalsupply", async () => {
      const communityFund = totalSupply.mul(9).div(100);
      const teamFund = totalSupply.mul(7).div(100);
  
      await dat.transfer(community.address, communityFund);
      await dat.transfer(team.address, teamFund);
  
      expect(await dat.balanceOf(community.address)).to.equal(communityFund);
      expect(await dat.balanceOf(team.address)).to.equal(teamFund);
    });
  
    it("Presale contract should get 25% of totalsupply", async () => {
      const presaleFund = totalSupply.mul(25).div(100);
      await dat.transfer(presale.address, presaleFund);
      expect(await dat.balanceOf(presale.address)).to.equal(presaleFund);
    }); 
  
    it("After the initial transfers, owner should be left with 59% of totalsupply", async () => {
      const expectation = totalSupply.mul(59).div(100);
      expect(await dat.balanceOf(owner.address)).to.equal(expectation);
    });
  
    it("Only owner should be able to exclude accounts from staking + fee", async () => {
      await expect(dat.connect(alice).excludeFromStaking(team.address)).to.be.reverted; 
      await expect(dat.connect(alice).excludeFromFee(team.address)).to.be.reverted; 
  
      await dat.excludeFromStaking(community.address);
      await dat.excludeFromFee(community.address);
      await dat.excludeFromStaking(team.address);
      await dat.excludeFromFee(team.address);
      await dat.excludeFromStaking(presale.address);
      await dat.excludeFromFee(presale.address);
      await dat.excludeFromStaking(presaleWallet.address);
      await dat.excludeFromFee(presaleWallet.address);
      await dat.excludeFromStaking(await dat.uniswapV2Router());
      await dat.excludeFromStaking(await dat.uniswapV2Pair());
    });
  
    it("Only owner should be able to update dev wallet", async () => {
      await expect(dat.connect(alice).updateWallet(dev.address)).to.be.reverted;
      await expect(dat.connect(owner).updateWallet(dev.address)).to.not.be.reverted;
  
      const devWallet = (await dat.wallet()).toString();
      expect(devWallet).to.equal(dev.address);
    });
  });

  /***PRESALE TEST***/

  describe.skip("Presale test", () => {

    describe("Before presale", () => {
      //Owner should add tiny amount of liquidty before presale
      before(async () => {
        const bnbToAdd = toWei(0.01); //0.1BNB
        const tokenToAdd = toWei(0.01 * 6.5 * 10**11, 3); //0.01x6.5x10^11 tokens
        const deadline = getCurrentTime(10); //now + 10sec
        
        await dat.approve(router.address, tokenToAdd);
        await router.addLiquidityETH(
          dat.address, tokenToAdd, "1", "1", owner.address, deadline, {value: bnbToAdd}
        );
      });

      it("isOpen should return false", async() => {
        expect(await presale.isOpen()).to.be.false;
      });

      it("hasClosed should return false", async() => {
        expect(await presale.hasClosed()).to.be.false;
      });

      it("Users shouldn't be able to buy", async() => {
        const toPay = toWei(0.1);
        await expect(presale.connect(alice).buyTokens({value: toPay})).to.be.reverted;
      });
    });

    describe("During presale", () => {
      before(async () => {
        await advanceTimeAndBlock(2000); //advance 2000sec
      });

      it("isOpen should return true", async () => {
        expect(await presale.isOpen()).to.be.true;
      });

      it("hasClosed should return false", async() => {
        expect(await presale.hasClosed()).to.be.false;
      });

      it("Users should be able to buy tokens", async () => {
        const toPay = 0.1;
        await expect(presale.connect(alice).buyTokens({value: toWei(toPay)})).to.not.be.reverted;
  
        const tokenBalance = Number(await dat.balanceOf(alice.address));
        const expectation =  toPay * rate * 10**3;
        await expect(tokenBalance).to.equal(expectation);
      });
  
      it("Users should not be able to buy tokens less than 0.01BNB in value", async () => {
        const toPay = toWei(0.009);
        await expect(presale.connect(alice).buyTokens({value: toPay})).to.be.reverted;
      });
  
      it("Users should not be able to buy more tokens more than 3BNB in value", async() => {
        const toPay = toWei(3); //would be 0.1 + 3 = 3.1 > 10
        await expect(presale.connect(alice).buyTokens({value: toPay})).to.be.reverted;
      });
  
      it("Owner should not be able to withdraw tokens or funds", async () => {
        await expect(presale.withdrawFunds()).to.be.reverted;
        await expect(presale.withdrawRemainingTokens()).to.be.reverted;
      });
    });

    describe("After presale", async() => {
      before(async () => {
        await advanceTimeAndBlock(10000); //advance 10000sec
      });

      it("isOpen should return false", async() => {
        expect(await presale.isOpen()).to.be.false;
      });

      it("hasClosed should return true", async() => {
        expect(await presale.hasClosed()).to.be.true;
      });

      it("Users should not be able to buy tokens anymore", async () => {
        const toPay = toWei(0.1);
        await expect(presale.connect(alice).buyTokens({value: toPay})).to.be.reverted;
      });

      it("Only owner should be able to withdraw", async () => {
        await expect(presale.connect(alice).withdrawFunds()).to.be.reverted;
        await expect(presale.connect(presaleWallet).withdrawRemainingTokens()).to.be.reverted;
      });

      it("Presale wallet should have tokens after withdraw", async () => {
        // await presale.withdrawRemainingTokens();

        // const tokenBalance = Number(await dat.balanceOf(presaleWallet.address));
        // const presaleFund = totalSupply * 25 / 100;
        // const toPay = 0.1;
        // const tokenExpectation = presaleFund - toPay * rate * 10**3;

        // expect(tokenBalance).to.equal(tokenExpectation);
      });

      it("Presale wallet should have BNB after withdraw", async () => {
        const bnbBalanceBefore = await presaleWallet.getBalance();
        await presale.withdrawFunds();

        const bnbBalanceAfter = await presaleWallet.getBalance();
        const bnbWithdrawn = bnbBalanceAfter.sub(bnbBalanceBefore);
        const bnbExpectation = 0.1 * 10**18;

        expect(Number(bnbWithdrawn)).to.equal(bnbExpectation);
      });
    });
  });

  /***Liquidity TEST***/

  describe.skip("Liquidty test", () => {
    before(async () => {
      //Transfer leftover tokens from presale to other users
      const leftover = await dat.balanceOf(presaleWallet.address);
      dat.connect(presaleWallet).transfer(charile.address, leftover);
    });

    describe("Before enabling swapping", async () => {
      it("Users should not be able to swap tokens", async () => {
        const tokensToSell = toWei(0.0001 * 6.5 * 10**11, 3); //0.0001BNB worth of tokens

        await dat.connect(charile).approve(router.address, tokensToSell);
        await expect(
          router.connect(charile).swapExactTokensForETHSupportingFeeOnTransferTokens(tokensToSell, "0", pathSell, charile.address, deadlineLong)
        ).to.be.reverted;
      });

      it("Users should not be able to add liquidty", async () => {
        const tokenToAdd = toWei(1.625 * 10**13, 3); //1.625x10^13 tokens
        const bnbToAdd = toWei(25); //25BNB

        await dat.connect(charile).approve(router.address, tokenToAdd);
        await expect(router.connect(charile).addLiquidityETH(
          dat.address, tokenToAdd, "1", "1", charile.address, deadlineLong, {value: bnbToAdd}
        )).to.be.reverted;
      });
    });

    describe("Swapping enabled but low liquidty", async () => {
      it("Only owner should be able to enable swapping", async () => {
        await expect(dat.connect(alice).setSwap(true)).to.be.reverted;
        await expect(dat.connect(owner).setSwap(true)).to.not.be.reverted;
      });

      it("Users should not be able to dump (10% slippage)", async () => {
        const tokensToSell = toWei(1 * 6.5 * 10**11, 3); //1BNB worth of tokens

        await dat.connect(charile).approve(router.address, tokensToSell);
        await expect(router.connect(charile).swapExactTokensForETHSupportingFeeOnTransferTokens(
          tokensToSell, "0.9", pathSell, charile.address, deadlineLong
        )).to.be.reverted;
      });
  
      it("Users should not be able to sell even 0.01BNB worth of tokens (10% slippage)", async () => {
        const tokensToSell = toWei(0.01 * 6.5 * 10**11, 3); //0.01BNB worth of tokens
  
        await dat.connect(charile).approve(router.address, tokensToSell);
        await expect(
          router.connect(charile).swapExactTokensForETHSupportingFeeOnTransferTokens(tokensToSell, "0.009", pathSell, charile.address, deadlineLong)
        ).to.be.reverted;
      });
    });

    describe("After providing liquity", async () => {
      before(async () => {
        const tokenToAdd = toWei(1.625 * 10**14, 3); //1.625x10^14 tokens
        const bnbToAdd = toWei(250); //250BNB

        await dat.approve(router.address, tokenToAdd);
        await router.addLiquidityETH(
          dat.address, tokenToAdd, "1", "1", owner.address, deadlineLong, {value: bnbToAdd}
        );
      });

      it("Users should be able to sell some now", async () => {
        const tokensToSell = toWei(1 * 6.5 * 10**11, 3); //1BNB worth of tokens
        const bnbBalanceBefore = await charile.getBalance();

        await dat.connect(charile).approve(router.address, tokensToSell);
        await expect(
          router.connect(charile).swapExactTokensForETHSupportingFeeOnTransferTokens(tokensToSell, "0", pathSell, charile.address, deadlineLong)
        ).to.not.be.reverted;

        const bnbBalanceAfter = await charile.getBalance();
        const bnbReceived = bnbBalanceAfter.sub(bnbBalanceBefore);

        //BNB received should be around 85% of 1BNB
        expect(Number(bnbReceived)).to.be.within(0.8 * 10**18, 0.9 * 10**18);
      });
    });
  });

  describe.skip("Auto BTCB test", async () => {
    before(async () => {
      //Change numTokensSellToAddToLiquidity value for testing env
      // await dat.updateNumTokensSellToAddToLiquidity("30000");
      
      //Turn off buyLimit
      await dat.updateBuyLimit("0");
      //Set max sell limit to 0.5%
      await dat.updateSellLimit("5000");

      //Bob buys and sell many many times
      const bnbToSwap = toWei(2);
      for(let i = 0; i < 100; i++){
        //Buy tokens
        const tx1 = await router.connect(bob).swapExactETHForTokensSupportingFeeOnTransferTokens(
          "0", pathBuy, bob.address, deadlineLong, {value: bnbToSwap}
        );
        await tx1.wait();

        //Sell tokens
        const tokensToSwap = await dat.balanceOf(bob.address);
        await dat.connect(bob).approve(router.address, tokensToSwap);
        const tx2 = await router.connect(bob).swapExactTokensForETHSupportingFeeOnTransferTokens(
          tokensToSwap, "0", pathSell, bob.address, deadlineLong
        );
        await tx2.wait(); 
      }
    });

    it("Token contract should have BTCB for distribution", async () => {
      let balance = Number(await btcb.balanceOf(dat.address));
      // console.log(`Token contract BTCB balance from tax: ${balance}`);
      expect(balance).to.be.greaterThan(0);
    });

    it("Charile should get some BTCB after withdraw", async () => {
      //Withdraw BTCB
      await dat.connect(charile).withdraw();

      const btcBalance = Number(await btcb.balanceOf(charile.address));
      const btcWithdrawn = Number(await dat.btcWithdrawn(charile.address));
      // console.log(`Charile BTCB reward from tax: ${btcBalance}`);
      expect(btcBalance).to.be.greaterThan(0);
      expect(btcBalance).to.equal(btcWithdrawn);
    });

    it("Dev wallet should have around 10% of BTCB reward", async () => {
      const devBtcBalance = Number(await btcb.balanceOf(dev.address));
      const totalDistributions = Number(await dat.totalDistributions());
      const percentage = 100 * devBtcBalance / (devBtcBalance + totalDistributions);

      expect(percentage).to.be.within(9.9, 10.1);
    });

    it("Charile should have more tokens than before", async () => {
      const balanceBefore = await dat.stakeValue(charile.address);
      const balanceAfter = await dat.balanceOf(charile.address);
      const rewarded = balanceAfter.sub(balanceBefore);
      
      // console.log(`Charile token reward from tax: ${rewarded}`);
      expect(Number(rewarded)).to.be.greaterThan(0);
    });

    it("Charile should be able to stake more", async () => {
      await dat.connect(charile).restake();
      const stakeValue = await dat.stakeValue(charile.address);;
      const balance = await dat.balanceOf(charile.address);

      expect(stakeValue).to.equal(balance);
    });
  });

  describe.skip("Transfer test", async () => {
    it("Tokens can be burned", async () => {
      const toBurn = toWei(5 * 10**10, 3);
      const burnAddr = "0x000000000000000000000000000000000000dEaD";
      await dat.transfer(burnAddr, toBurn);

      const burnAddrBalance = Number(await dat.balanceOf(burnAddr));
      expect(burnAddrBalance).to.equal(5*10**10 * 10**3);
    });

    it("Users should be able to transfer even if swapping is set to false", async () => {
      await dat.setSwap(false);
      const toTransfer = (await dat.balanceOf(alice.address)).div(4);
      await expect(dat.connect(alice).transfer(charile.address, toTransfer)).to.not.be.reverted;
    });

    describe("When transfer tax is false", () => {
      it("Recipient should be receive exact amount as transfer amount", async () => {
        const toTransfer = (await dat.balanceOf(charile.address)).div(4);
        await dat.connect(charile).transfer(david.address, toTransfer);
  
        const davidBalance = await dat.balanceOf(david.address);
        expect(davidBalance).to.equal(toTransfer);
      });
    });

    describe("When transfer tax is true", async () => {
      it("Only owner can set tranfer tax to true", async () => {
        await expect(dat.connect(alice).setTranferTax(true)).to.be.reverted;
        await expect(dat.connect(owner).setTranferTax(true)).to.not.be.reverted;
      });
  
      it("Recipient should receive less tokens than transfer amount", async () => {
        const toTransfer = (await dat.balanceOf(charile.address)).div(4);
        await dat.connect(charile).transfer(eric.address, toTransfer);
  
        const ericBalance = await dat.balanceOf(eric.address);
        const _toTransfer = parseInt(toTransfer.toString());
        expect(Number(ericBalance.toString())).to.be.within(_toTransfer * 0.8, _toTransfer * 0.9);
      });
    });
  });
});