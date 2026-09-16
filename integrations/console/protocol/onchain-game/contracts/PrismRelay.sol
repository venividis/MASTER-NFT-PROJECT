// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title Prism Relay — deterministic, fully onchain territory game
/// @notice Stores every move and the resulting board onchain. No stakes, prizes,
///         mint authority, owner role, upgrade path, or offchain referee.
contract PrismRelay {
    uint8 public constant SIZE = 9;
    uint8 public constant MAX_MOVES = 36;
    uint256 public nextMatchId = 1;

    enum Status { Waiting, Active, Finished }

    struct Match {
        uint8[81] terrain; // 0 plain, 1 wall, 2 prism
        uint8[81] cells;   // 0 neutral, 1 player one, 2 player two
        address[2] players;
        uint16[2] scores;
        uint8 turn;
        uint8 moves;
        Status status;
        uint8 winner;     // 0 draw when Finished; 1/2 winning player
    }

    mapping(uint256 => Match) private matches;

    error UnknownMatch();
    error InvalidTerrain();
    error InvalidWorld();
    error WrongStatus();
    error SamePlayer();
    error NotYourTurn();
    error IllegalMove();

    event MatchCreated(uint256 indexed matchId, address indexed creator);
    event MatchJoined(uint256 indexed matchId, address indexed playerTwo);
    event CellClaimed(
        uint256 indexed matchId,
        uint8 indexed player,
        uint8 cell,
        uint8 points,
        uint8 nextTurn,
        uint8 moves
    );
    event MatchFinished(uint256 indexed matchId, uint8 winner, uint16 scoreOne, uint16 scoreTwo);

    /// @notice Create a waiting match; both plain corner starts must be connected
    ///         through at least 30 traversable cells. The creator is player one.
    function createMatch(uint8[81] calldata terrain) external returns (uint256 matchId) {
        _validateWorld(terrain);
        matchId = nextMatchId++;
        Match storage m = matches[matchId];
        for (uint256 i; i < 81; ++i) m.terrain[i] = terrain[i];
        m.cells[0] = 1;
        m.cells[80] = 2;
        m.players[0] = msg.sender;
        m.scores[0] = 1;
        m.scores[1] = 1;
        m.turn = 1;
        emit MatchCreated(matchId, msg.sender);
    }

    /// @notice The first distinct address to join becomes player two.
    function joinMatch(uint256 matchId) external {
        Match storage m = _match(matchId);
        if (m.status != Status.Waiting) revert WrongStatus();
        if (msg.sender == m.players[0]) revert SamePlayer();
        m.players[1] = msg.sender;
        m.status = Status.Active;
        emit MatchJoined(matchId, msg.sender);
    }

    /// @notice Claim an empty non-wall cell adjacent to any of your territory.
    ///         Plain cells score one and prisms four. An opponent without a move
    ///         is skipped. Finish after 36 claims or when neither can claim.
    function move(uint256 matchId, uint8 cell) external {
        Match storage m = _match(matchId);
        if (m.status != Status.Active) revert WrongStatus();
        uint8 player = m.turn;
        if (msg.sender != m.players[player - 1]) revert NotYourTurn();
        if (cell >= 81 || !_canClaim(m, player, cell)) revert IllegalMove();

        uint8 points = m.terrain[cell] == 2 ? 4 : 1;
        m.cells[cell] = player;
        m.scores[player - 1] += points;
        ++m.moves;
        m.turn = 3 - player;
        bool available = _hasLegalMove(m, m.turn);
        if (!available) {
            m.turn = player;
            available = _hasLegalMove(m, player);
        }
        emit CellClaimed(matchId, player, cell, points, m.turn, m.moves);

        if (m.moves >= MAX_MOVES || !available) {
            m.status = Status.Finished;
            m.winner = m.scores[0] == m.scores[1] ? 0 : m.scores[0] > m.scores[1] ? 1 : 2;
            emit MatchFinished(matchId, m.winner, m.scores[0], m.scores[1]);
        }
    }

    /// @notice Complete authoritative board and participants. Status disambiguates
    ///         an unfinished winner value of zero from a finished draw.
    function getMatch(uint256 matchId) external view returns (Match memory) {
        return _match(matchId);
    }

    /// @notice Current player's legal cells in ascending order; empty if inactive.
    function getLegalMoves(uint256 matchId) external view returns (uint8[] memory cells) {
        Match storage m = _match(matchId);
        if (m.status != Status.Active) return new uint8[](0);
        uint8[81] memory buffer;
        uint256 count;
        for (uint8 i; i < 81; ++i) {
            if (_canClaim(m, m.turn, i)) buffer[count++] = i;
        }
        cells = new uint8[](count);
        for (uint256 i; i < count; ++i) cells[i] = buffer[i];
    }

    function _match(uint256 matchId) private view returns (Match storage m) {
        if (matchId == 0 || matchId >= nextMatchId) revert UnknownMatch();
        return matches[matchId];
    }

    function _canClaim(Match storage m, uint8 player, uint8 cell) private view returns (bool) {
        if (m.cells[cell] != 0 || m.terrain[cell] == 1) return false;
        uint8 x = cell % SIZE;
        return (x > 0 && m.cells[cell - 1] == player)
            || (x < 8 && m.cells[cell + 1] == player)
            || (cell >= SIZE && m.cells[cell - SIZE] == player)
            || (cell < 72 && m.cells[cell + SIZE] == player);
    }

    function _hasLegalMove(Match storage m, uint8 player) private view returns (bool) {
        for (uint8 i; i < 81; ++i) if (_canClaim(m, player, i)) return true;
        return false;
    }

    function _validateWorld(uint8[81] calldata terrain) private pure {
        if (terrain[0] != 0 || terrain[80] != 0) revert InvalidWorld();
        for (uint256 i; i < 81; ++i) if (terrain[i] > 2) revert InvalidTerrain();

        // Fixed-size breadth-first search; one bit per discovered cell.
        uint8[81] memory queue;
        uint256 head;
        uint256 tail = 1;
        uint256 visited = 1;
        while (head < tail) {
            uint256 cell = queue[head++];
            for (uint256 direction; direction < 4; ++direction) {
                uint256 next;
                if (direction == 0) {
                    if (cell % 9 == 0) continue;
                    next = cell - 1;
                } else if (direction == 1) {
                    if (cell % 9 == 8) continue;
                    next = cell + 1;
                } else if (direction == 2) {
                    if (cell < 9) continue;
                    next = cell - 9;
                } else {
                    if (cell >= 72) continue;
                    next = cell + 9;
                }
                uint256 mask = uint256(1) << next;
                if (terrain[next] != 1 && (visited & mask) == 0) {
                    visited |= mask;
                    queue[tail++] = uint8(next);
                }
            }
        }
        if (tail < 30 || (visited & (uint256(1) << 80)) == 0) revert InvalidWorld();
    }
}
