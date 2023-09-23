const { assert, expect } = require("chai")
const { network, deployments, ethers } = require("hardhat")
const { developmentChains } = require("../../helper-hardhat-config")

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("FundMe", function () {
          let fundMe
          let mockV3Aggregator
          let deployer
          const sendValue = ethers.utils.parseEther("1")

          beforeEach(async () => {
              deployer = (await getNamedAccounts()).deployer
              // const accounts = await ethers.getSigners()
              // deployer = accounts[0]
              await deployments.fixture(["all"])
              fundMe = await ethers.getContract("FundMe", deployer)
              mockV3Aggregator = await ethers.getContract(
                  "MockV3Aggregator",
                  deployer
              )
          })
          describe("constructor", function () {
              it("sets the aggregator addresses correctly", async () => {
                  const response = await fundMe.getPriceFeed()
                  assert.equal(response, mockV3Aggregator.address)
              })
          })
          describe("fund", function () {
              // https://ethereum-waffle.readthedocs.io/en/latest/matchers.html
              // could also do assert.fail
              it("Fails if you don't send enough ETH", async () => {
                  await expect(fundMe.fund()).to.be.revertedWith(
                      "You need to spend more ETH!"
                  )
              })
              // we could be even more precise here by making sure exactly $50 works
              // but this is good enough for now
              it("Updates the amount funded data structure", async () => {
                  await fundMe.fund({ value: sendValue })
                  const response = await fundMe.getAddressToAmountFunded(
                      deployer
                  )
                  assert.equal(response.toString(), sendValue.toString())
              })
              it("Adds funder to array of funders", async () => {
                  await fundMe.fund({ value: sendValue })
                  const response = await fundMe.getFunder(0)
                  assert.equal(response, deployer)
              })
          })
          describe("Time-Lock", function () {
              let account1Connected
              let account1
              beforeEach(async () => {
                  [account1] = await ethers.getSigners()
                  account1Connected = await fundMe.connect(account1)
                  await account1Connected.fund({ value: sendValue })
              })
              it("Should return the correct time remaining for withdrawal", async () => {
                  await network.provider.send("evm_increaseTime", [120])
                  await network.provider.send("evm_mine")
                  const timeLeft =
                      await fundMe.getTimeRemainingForWithdrawal(
                          account1.address
                      )
                  expect(await timeLeft).to.equal("0")
              })
              it("Should not allow withdrawal before time lock", async () => {
                  await expect(account1Connected.withdraw()).to.be.revertedWith(
                      "Withdrawal locked. Please wait until lock time ends!"
                  )
              })
          })
          describe("withdraw", function () {
              beforeEach(async () => {
                  await fundMe.fund({ value: sendValue })
              })
              it("Should allow withdrawal after time lock", async () => {
                  //   const ownerWithdraw = await fundMe.connect(deployer);
                  const startingFundMeBalance =
                      await fundMe.provider.getBalance(fundMe.address)
                  const startingDeployerBalance =
                      await fundMe.provider.getBalance(deployer)
                  // Increase time by 5 minutes
                  await network.provider.send("evm_increaseTime", [120])
                  await network.provider.send("evm_mine")

                  const transactionResponse = await fundMe.withdraw()
                  const transactionReceipt = await transactionResponse.wait()
                  const { gasUsed, effectiveGasPrice } = transactionReceipt
                  const gasCost = gasUsed.mul(effectiveGasPrice)

                  const endingFundMeBalance = await fundMe.provider.getBalance(
                      fundMe.address
                  )
                  const endingDeployerBalance =
                      await fundMe.provider.getBalance(deployer)

                  assert.equal(endingFundMeBalance, 0)
                  assert.equal(
                      startingFundMeBalance
                          .add(startingDeployerBalance)
                          .toString(),
                      endingDeployerBalance.add(gasCost).toString()
                  )
              })
              // this test is overloaded. Ideally we'd split it into multiple tests
              // but for simplicity we left it as one
              it("is allows us to withdraw with multiple funders after time lock", async () => {
                  // Arrange
                  const accounts = await ethers.getSigners()
                  for (i = 1; i < 6; i++) {
                      const fundMeConnectedContract = await fundMe.connect(
                          accounts[i]
                      )
                      await fundMeConnectedContract.fund({ value: sendValue })
                  }
                  const startingFundMeBalance =
                      await fundMe.provider.getBalance(fundMe.address)
                  const startingDeployerBalance =
                      await fundMe.provider.getBalance(deployer)

                  // Increase time by 2 minutes
                  await network.provider.send("evm_increaseTime", [120])
                  await network.provider.send("evm_mine")
                  // Act
                  const transactionResponse = await fundMe.cheaperWithdraw()
                  // Let's comapre gas costs :)
                  // const transactionResponse = await fundMe.withdraw()
                  const transactionReceipt = await transactionResponse.wait()
                  const { gasUsed, effectiveGasPrice } = transactionReceipt
                  const withdrawGasCost = gasUsed.mul(effectiveGasPrice)
                  console.log(`GasCost: ${withdrawGasCost}`)
                  console.log(`GasUsed: ${gasUsed}`)
                  console.log(`GasPrice: ${effectiveGasPrice}`)
                  const endingFundMeBalance = await fundMe.provider.getBalance(
                      fundMe.address
                  )
                  const endingDeployerBalance =
                      await fundMe.provider.getBalance(deployer)
                  // Assert
                  assert.equal(
                      startingFundMeBalance
                          .add(startingDeployerBalance)
                          .toString(),
                      endingDeployerBalance.add(withdrawGasCost).toString()
                  )
                  console.log("starting fundMe balance equals to ending deployer balance");
                  // Make a getter for storage variables
                //   await expect(fundMe.getFunder(0)).to.be.reverted

                  for (i = 1; i < 6; i++) {
                      assert.equal(
                          await fundMe.getAddressToAmountFunded(
                              accounts[i].address
                          ),
                          0
                      )
                  }
              })
              it("Only allows the owner to withdraw", async function () {
                  const accounts = await ethers.getSigners()
                  const fundMeConnectedContract = await fundMe.connect(
                      accounts[1]
                  )
                  await expect(
                      fundMeConnectedContract.withdraw()
                  ).to.be.revertedWith("FundMe__NotOwner")
              })
          })
          describe("Checking version", function () {
              it("Should return the correct version", async () => {
                  //   console.log(aggregatorInstance.version());
                  expect(await fundMe.getVersion().toString()).to.equal(
                      mockV3Aggregator.version().toString()
                  )
              })
          })
          describe("Get the owner", function () {
              it("Should return the owner of the contract", async () => {
                  const contractOwner = await fundMe.getOwner()
                  expect(contractOwner).to.equal(deployer)
              })
          })
      })
