// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC1155} from "../vendor/solady/tokens/ERC1155.sol";
import {SafeTransferLib} from "../vendor/solady/utils/SafeTransferLib.sol";
import {ReentrancyGuard} from "../vendor/solady/utils/ReentrancyGuard.sol";

/// @notice Permissionless ERC-1155 game item editions with creator-selected mint terms.
/// @dev Payment token address(0) means native currency. No platform fee or mandatory recipient.
contract CreatorItems is ERC1155, ReentrancyGuard {
    struct Item {
        address creator;
        address paymentToken;
        address receiver;
        uint256 unitPrice;
        uint256 maxSupply;
        uint256 minted;
        uint64 saleRevision;
        bool saleActive;
        bool metadataFrozen;
        string metadataURI;
    }

    uint256 public nextId = 1;
    mapping(uint256 => Item) private _items;

    error OnlyCreator();
    error InvalidItem();
    error InvalidTerms();
    error SaleClosed();
    error SupplyExceeded();
    error QuoteChanged();
    error IncorrectPayment();
    error MetadataFrozen();
    error UnsupportedPaymentBehavior();

    event ItemCreated(uint256 indexed id, address indexed creator, string metadataURI);
    event SaleConfigured(uint256 indexed id, uint64 revision, address paymentToken, uint256 unitPrice, address receiver, bool active);
    event ItemPurchased(uint256 indexed id, address indexed buyer, address indexed recipient, uint256 amount, address paymentToken, uint256 totalPrice);
    event CreatorChanged(uint256 indexed id, address indexed previousCreator, address indexed nextCreator);

    function uri(uint256 id) public view override returns (string memory) {
        _requireExists(id);
        return _items[id].metadataURI;
    }

    function item(uint256 id) external view returns (Item memory) {
        _requireExists(id);
        return _items[id];
    }

    function createItem(
        string calldata metadataURI, address paymentToken, uint256 unitPrice, address receiver, uint256 maxSupply
    ) external returns (uint256 id) {
        _validateTerms(paymentToken, receiver);
        if (bytes(metadataURI).length == 0) revert InvalidTerms();
        id = nextId++;
        _items[id] = Item(msg.sender, paymentToken, receiver, unitPrice, maxSupply, 0, 1, true, false, metadataURI);
        emit ItemCreated(id, msg.sender, metadataURI);
        emit URI(metadataURI, id);
        emit SaleConfigured(id, 1, paymentToken, unitPrice, receiver, true);
    }

    function configureSale(uint256 id, address paymentToken, uint256 unitPrice, address receiver, bool active) external {
        _onlyCreator(id);
        _validateTerms(paymentToken, receiver);
        Item storage it = _items[id];
        it.paymentToken = paymentToken;
        it.unitPrice = unitPrice;
        it.receiver = receiver;
        it.saleActive = active;
        emit SaleConfigured(id, ++it.saleRevision, paymentToken, unitPrice, receiver, active);
    }

    /// @notice Buyer pins token, revision and total price so changing sale terms cannot silently alter an order.
    function mintItem(
        uint256 id, address to, uint256 amount, address expectedPaymentToken, uint64 expectedRevision, uint256 maxTotalPrice
    ) external payable nonReentrant {
        _requireExists(id);
        Item storage it = _items[id];
        if (!it.saleActive) revert SaleClosed();
        if (amount == 0 || to == address(0)) revert InvalidTerms();
        if (it.maxSupply != 0 && amount > it.maxSupply - it.minted) revert SupplyExceeded();
        uint256 price = it.unitPrice * amount;
        if (it.paymentToken != expectedPaymentToken || it.saleRevision != expectedRevision || price > maxTotalPrice)
            revert QuoteChanged();
        it.minted += amount;

        address paymentToken = it.paymentToken;
        address receiver = it.receiver;
        if (paymentToken == address(0)) {
            if (msg.value != price) revert IncorrectPayment();
            if (price != 0) SafeTransferLib.safeTransferETH(receiver, price);
        } else {
            if (msg.value != 0) revert IncorrectPayment();
            if (price != 0) {
                uint256 beforeBalance = SafeTransferLib.balanceOf(paymentToken, receiver);
                SafeTransferLib.safeTransferFrom(paymentToken, msg.sender, receiver, price);
                uint256 afterBalance = SafeTransferLib.balanceOf(paymentToken, receiver);
                uint256 expectedReceived = receiver == msg.sender ? 0 : price;
                if (afterBalance < beforeBalance || afterBalance - beforeBalance != expectedReceived)
                    revert UnsupportedPaymentBehavior();
            }
        }
        _mint(to, id, amount, "");
        emit ItemPurchased(id, msg.sender, to, amount, paymentToken, price);
    }

    function setMetadataURI(uint256 id, string calldata metadataURI) external {
        _onlyCreator(id);
        if (_items[id].metadataFrozen) revert MetadataFrozen();
        if (bytes(metadataURI).length == 0) revert InvalidTerms();
        _items[id].metadataURI = metadataURI;
        emit URI(metadataURI, id);
    }

    function freezeMetadata(uint256 id) external {
        _onlyCreator(id);
        _items[id].metadataFrozen = true;
    }

    function transferCreator(uint256 id, address nextCreator) external {
        _onlyCreator(id);
        if (nextCreator == address(0)) revert InvalidTerms();
        emit CreatorChanged(id, msg.sender, nextCreator);
        _items[id].creator = nextCreator;
    }

    function _requireExists(uint256 id) private view {
        if (_items[id].creator == address(0)) revert InvalidItem();
    }

    function _onlyCreator(uint256 id) private view {
        if (msg.sender != _items[id].creator) revert OnlyCreator();
    }

    function _validateTerms(address paymentToken, address receiver) private view {
        if (receiver == address(0) || (paymentToken != address(0) && paymentToken.code.length == 0)) revert InvalidTerms();
    }
}
