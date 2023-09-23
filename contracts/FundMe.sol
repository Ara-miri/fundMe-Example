// SPDX-License-Identifier: MIT
// 1. Pragma
pragma solidity ^0.8.7;
// 2. Imports
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import "./PriceConverter.sol";

// 3. Interfaces, Libraries, Contracts
error FundMe__NotOwner();

/**@title A sample Funding Contract
 * @author Patrick Collins
 * @notice This contract is for creating a sample funding contract
 * @dev This implements price feeds as our library
 */
contract FundMe {
    // Type Declarations
    using PriceConverter for uint256;

    // State variables
    uint256 public constant WITHDRAWAL_LOCK_DURATION = 2 minutes;
    mapping(address => uint256[]) public s_funderContributions; // Track contributions for each funder
    uint256 public constant MINIMUM_USD = 1 * 10 ** 6;
    address private immutable i_owner;
    address[] private s_funders;
    mapping(address => uint256) private s_addressToAmountFunded;
    AggregatorV3Interface private s_priceFeed;

    event Fund(address indexed funder, uint amount);
    event Withdraw(address indexed recipient, uint amount);

    // Modifiers
    modifier onlyOwner() {
        // require(msg.sender == i_owner);
        if (msg.sender != i_owner) revert FundMe__NotOwner();
        _;
    }

    constructor(address priceFeed) {
        s_priceFeed = AggregatorV3Interface(priceFeed);
        i_owner = msg.sender;
    }

    /// @notice Funds our contract based on the ETH/USD price
    function fund() public payable {
        require(
            msg.value.getConversionRate(s_priceFeed) >= MINIMUM_USD,
            "You need to spend more ETH!"
        );
        s_funderContributions[msg.sender].push(block.timestamp); // Record the contribution timestamp
        s_addressToAmountFunded[msg.sender] += msg.value;

        s_funders.push(msg.sender);
        emit Fund(msg.sender, msg.value);
    }
    function getTimeRemainingForWithdrawal(address _funder) public view returns (uint256) {
        uint256[] memory contributions = s_funderContributions[_funder];
        require(contributions.length > 0, "No contribution found for this address");

        uint256 lastContribution = contributions[contributions.length - 1]; // Get the most recent contribution

        uint256 unlockTime = lastContribution + WITHDRAWAL_LOCK_DURATION;

        if (block.timestamp < unlockTime) {
            return unlockTime - block.timestamp;
        } else {
            return 0;
        }
    }

    function withdraw() public onlyOwner {
        (uint timeRemaining) = getTimeRemainingForWithdrawal(msg.sender);
        require(timeRemaining == 0,
        "Withdrawal locked. Please wait until lock time ends!");
        uint256[] storage contributions = s_funderContributions[msg.sender];
        uint256 lastContribution = contributions[contributions.length - 1];

        require(lastContribution > 0, "No contribution found for this address"); 
        contributions.pop(); // Remove the last contribution
        
        for (
            uint256 funderIndex = 0;
            funderIndex < s_funders.length;
            funderIndex++
        ) {
            address funder = s_funders[funderIndex];
            s_addressToAmountFunded[funder] = 0;
        }
        s_funders = new address[](0);
        uint256 amountToBeWithdrawn = address(this).balance;
        // Transfer vs call vs Send
        // payable(msg.sender).transfer(address(this).balance);
        (bool success, ) = i_owner.call{value: amountToBeWithdrawn}("");
        require(success);
        emit Withdraw(msg.sender, amountToBeWithdrawn);
    }

    function cheaperWithdraw() public onlyOwner {
        address[] memory funders = s_funders;
        (uint timeRemaining) = getTimeRemainingForWithdrawal(msg.sender);
        require(timeRemaining == 0,
        "Withdrawal locked. Please wait until lock time ends!");
        uint256[] storage contributions = s_funderContributions[msg.sender];
        uint256 lastContribution = contributions[contributions.length - 1];

        require(lastContribution > 0, "No contribution found for this address"); 
        contributions.pop(); // Remove the last contribution
        
        for (
            uint256 funderIndex = 0;
            funderIndex < s_funders.length;
            funderIndex++
        ) {
            address funder = s_funders[funderIndex];
            s_addressToAmountFunded[funder] = 0;
        }
        funders = new address[](0);
        uint256 amountToBeWithdrawn = address(this).balance;
        // Transfer vs call vs Send
        // payable(msg.sender).transfer(address(this).balance);
        (bool success, ) = i_owner.call{value: amountToBeWithdrawn}("");
        require(success);
        emit Withdraw(msg.sender, amountToBeWithdrawn);
    }

    /** @notice Gets the amount that an address has funded
     *  @param fundingAddress the address of the funder
     *  @return the amount funded
     */
    function getAddressToAmountFunded(address fundingAddress)
        public
        view
        returns (uint256)
    {
        return s_addressToAmountFunded[fundingAddress];
    }

    function getVersion() public view returns (uint256) {
        return s_priceFeed.version();
    }

    function getFunder(uint256 index) public view returns (address) {
        return s_funders[index];
    }

    function getOwner() public view returns (address) {
        return i_owner;
    }

    function getPriceFeed() public view returns (AggregatorV3Interface) {
        return s_priceFeed;
    }
}
