import React, { Component } from "react";

//prettier-ignore
import { Pawn, Rook, Knight, Bishop, Queen, King } from "../pieces/allPieceExport.jsx";
//prettier-ignore
import { playMoveSound, playCaptureSound, playOutOfBoundSound, playEndGame } from "../helper-functions/sounds";
import UserInterface from "./ui/userInterface.jsx";
import convertNotation from "../helper-functions/notationConverter";
import { isEmpty } from "lodash";
import { getPieceWithDom } from "../helper-functions/getPieceWithDom";
import updatePieceCoords from "../helper-functions/updatePieceCoords";
import promotion from "../chessLogic/promotionLogic";
import postMoveBoardSweep from "../helper-functions/postMoveBoardSweep";
import check from "../chessLogic/checkDetection";
import checkmate from "../chessLogic/checkmateDetection";
import chessMove from "../chessLogic/chessMove";
import positionValidator from "../chessLogic/positionValidator";
import insufficientMaterial from "../chessLogic/insufficientMaterial";
import threefoldRepition from "../chessLogic/threefoldRepitition";
import basicMove from "../chessLogic/basicMove";
import evaluate from "../chessLogic/evaluate";

//components
import Chessboard from "./chessboard/chessboard.jsx";
import boardStateConverter from "../helper-functions/boardStateConverter.js";

//ChessApp Component renders entire application
class ChessApp extends Component {
    constructor() {
        super();
        this.state = {
            // Tracks the board configuration over time
            history: [
                {
                    // This is our board representation
                    // ** CHANGING THIS WILL CHANGE THE PRESENTATION OF THE BOARD **
                    boardConfig: [
                        [{}, {}, {}, {}, {}, {}, {}, {}],
                        [{}, {}, {}, {}, {}, {}, {}, {}],
                        [{}, {}, {}, {}, {}, {}, {}, {}],
                        [{}, {}, {}, {}, {}, {}, {}, {}],
                        [{}, {}, {}, {}, {}, {}, {}, {}],
                        [{}, {}, {}, {}, {}, {}, {}, {}],
                        [{}, {}, {}, {}, {}, {}, {}, {}],
                        [{}, {}, {}, {}, {}, {}, {}, {}],
                    ],
                },
            ],
            // Initializes game to move 0 and white-to-move and board rotation
            stepNumber: 0,
            whiteIsNext: true,
            rotation: 0,
            endGame: false,
        };

        // Dragging props
        this.draggingPiece = {};
        this.draggingPieceMoveable = [];

        // Function binding
        this.idToPiece = this.idToPiece.bind(this);
        this.moveHandler = this.moveHandler.bind(this);
        this.dragStartHandlerProp = this.dragStartHandler.bind(this);
        this.setUpBoard = this.setUpBoard.bind(this);
        this.moveBack = this.moveBack.bind(this);
        this.moveForward = this.moveForward.bind(this);
        this.rotateBoard = this.rotateBoard.bind(this);
        this.computerMove = this.computerMove.bind(this);

        // Pieces
        this.whitePieces = [];
        this.blackPieces = [];
        this.allPieces = [];

        // Remaining Pieces
        this.remainingWhitePieces = [];
        this.remainingBlackPieces = [];
        this.remainingAllPieces = [];

        // Remembers last move
        this.lastMoveSquares = [];
    }

    componentDidMount() {
        this.setUpBoard();
    }

    //this function is responsible for returning a piece object given an id
    idToPiece(pieceId) {
        const [movedPiece] = this.allPieces.filter(
            (piece) => piece.id === pieceId,
        );

        return movedPiece;
    }

    // Executes the moves on the board
    moveHandler(oldBoardConfig, pieceId, from, to) {
        // Remove filter of target tile
        const targetTile = document.querySelector(`#${to}`);
        targetTile.classList.remove("dragged-over");

        // Don't do anything if you're setting the piece down
        if (from === to) {
            return;
        }

        // Don't do anything if the game ended
        const { endGame } = this.state;
        if (endGame) {
            return;
        }

        // Don't do anything if someone resigned
        const { resignation } = this.props;
        if (resignation.all) {
            return;
        }

        // If user is not on the most up-to-date move, don't continue
        const gameHistory = this.state.history;
        if (this.state.stepNumber !== gameHistory.length - 1) {
            return;
        }

        // Resets our text feedback
        const userFeedback = document.querySelector(".user-feedback");
        userFeedback.innerHTML = ``;

        // Get reference to our piece object
        const movedPiece = this.idToPiece(pieceId);

        // Resets dragging piece
        this.draggingPiece = {};

        // ** ***************************************** **
        // ** Everything before is guaranteed to happen **
        // ** ***************************************** **

        // Sees if the move is valid
        const moveData = chessMove(to, from, movedPiece, oldBoardConfig);

        // Move data object
        let {
            validMove,
            newBoardConfig,
            pawnMovedTwo,
            castleEvent,
            enPassantEvent,
            promotionEvent,
        } = moveData;

        // If move would leave king in check, do not proceed
        if (!validMove) {
            playOutOfBoundSound();
            return;
        }

        // ** ******************************************* **
        // ** Everything after only happens if valid move **
        // ** ******************************************* **

        // Update our moved piece id/coords
        updatePieceCoords(movedPiece, to);

        // Returns enemy king for dealing check detection, also removes styling post move
        let {
            oppKing,
            remainingWhitePieces,
            remainingBlackPieces,
        } = postMoveBoardSweep(movedPiece, newBoardConfig);

        // Promotion (including underpromotion)
        let promo = promotion(to, movedPiece, this.props.promotion, this.props);

        // If promoted, update board
        if (!isEmpty(promo)) {
            const coords = convertNotation(to);
            const id = boardStateConverter(coords);
            newBoardConfig[id[0]][id[1]] = promo;
            updatePieceCoords(promo, to);
            this.allPieces.push(promo);
        }

        // Restrict one-time moves
        if (movedPiece.name === "King") {
            movedPiece.castlingAvailable = false;
        } else if (movedPiece.name === "Pawn") {
            movedPiece.moveTwoAvailable = false;
        } else if (movedPiece.name === "Rook") {
            movedPiece.hasMoved = true;
        }

        // Pawn-move-two-tiles handler
        if (pawnMovedTwo) {
            movedPiece.vulnerableToEnPassant = true;
        }

        // Initialize Endgame variable to false
        let endOfGame = false;

        // Did we deal check with that move?
        let dealtCheck = check(movedPiece, oppKing, newBoardConfig);

        // Check if opponent has a move
        let noMoves = checkmate(movedPiece, newBoardConfig);

        // Is there sufficient material for a checkmate?
        const notEnoughMaterial = insufficientMaterial(
            this.allPieces,
            newBoardConfig,
        );

        // Threefold repitition
        const threefoldDraw = threefoldRepition(this.state.history);

        // End game
        // Checkmate
        if (noMoves && dealtCheck) {
            endOfGame = true;
            userFeedback.innerHTML = "Checkmate!";
            // Stalemate
        } else if (noMoves) {
            endOfGame = true;
            userFeedback.innerHTML = "Stalemate!";
            // Insufficient material
        } else if (notEnoughMaterial) {
            endOfGame = true;
            userFeedback.innerHTML = "Insufficient material, draw!";
        }

        //if check, color appropriate squares
        if (dealtCheck) {
            const kingSqr = document.querySelector(
                `#${oppKing.flatChessCoords}`,
            );
            if (kingSqr.parentElement.classList.contains("light-square")) {
                kingSqr.parentElement.classList.add("light-tile-check");
            } else {
                kingSqr.parentElement.classList.add("dark-tile-check");
            }
        }

        //sounds
        const placeholderLocal = "http://localhost:9000/images/placeholder.png";
        const placeholderHeroku =
            "https://knightchess.herokuapp.com/images/placeholder.png";
        const imageFileOfTarget = targetTile.firstChild.src;
        if (endOfGame) {
            playEndGame();
            const chessboard = document.querySelector("#chessboard-backdrop");
            const newGameBtn = document.querySelector("#newGame-btn");
            chessboard.style.filter = "grayscale(100%)";
            newGameBtn.style.visibility = "visible";
        } else {
            // If the tile is empty (or not en passant) we play normal move sound
            if (
                (imageFileOfTarget === placeholderLocal ||
                    imageFileOfTarget === placeholderHeroku) &&
                !enPassantEvent
            ) {
                playMoveSound();
            } else {
                playCaptureSound();
            }
        }

        //stores the squares involved in last move for a moment
        this.lastMoveSquares = [from, to];

        //snag our board configuration returned by chess.js
        let boardConfig = newBoardConfig;

        //increment move
        const newStepNumber = this.state.stepNumber + 1;

        //get reference to current state
        const history = this.state.history;
        const newBoardPosition = { boardConfig };

        // Updates remining pieces
        this.remainingWhitePieces = remainingWhitePieces;
        this.remainingBlackPieces = remainingBlackPieces;
        this.remainingAllPieces = remainingWhitePieces.concat(
            remainingBlackPieces,
        );

        // console.log(evaluate(boardConfig));

        // Updates whole board and adds history log
        this.setState({
            whiteIsNext: !this.state.whiteIsNext,
            stepNumber: newStepNumber,
            history: [...history, newBoardPosition],
            endGame: endOfGame,
        });

        // calls a computer move right after
        if (!this.state.whiteIsNext && !endOfGame) {
            setTimeout(() => this.computerMove(), 1000);
        }
    }

    // Generates a computer move
    computerMove() {
        const history = this.state.history;
        const current = history[this.state.stepNumber].boardConfig;

        // Pull in our pieces on the board
        let blackPieces = this.remainingBlackPieces;
        let whitePieces = this.remainingWhitePieces;
        let allPieces = this.remainingAllPieces;

        // Determine valid moves
        for (let piece of blackPieces) {
            // Resets the valid moves for the piece
            piece.validMoves = [];
            const from = piece.flatChessCoords;

            // Cycles through board to get all available moves
            for (let row = 0; row < 8; row++) {
                for (let col = 0; col < 8; col++) {
                    const to = convertNotation([row, col]).join("");

                    // If it is a valid move, store it
                    const moveData = chessMove(to, from, piece, current);

                    if (moveData.validMove) {
                        const newBoard = moveData.newBoardConfig;
                        const evaluation = evaluate(newBoard);
                        piece.validMoves.push({ move: to, eval: evaluation });
                    }
                }
            }
        }

        const moveSelector = () => {
            // Get array of pieces with moves
            const blackPiecesWithMoves = blackPieces.filter((piece) => {
                if (piece.validMoves.length !== 0) {
                    return piece;
                }
            });

            let bestMoveArray = [];
            let bestEvaluation = 100000;

            blackPiecesWithMoves.forEach((piece) => {
                piece.validMoves.forEach((move) => {
                    if (move.eval < bestEvaluation) {
                        bestEvaluation = move.eval;
                        bestMoveArray = [];
                    }

                    if (move.eval === bestEvaluation) {
                        const maxMove = {
                            piece: null,
                            move: "",
                            eval: 100000,
                        };

                        maxMove.piece = piece;
                        maxMove.move = move.move;
                        maxMove.eval = move.eval;

                        bestMoveArray.push(maxMove);
                    }
                });
            });

            // Randomly selects among the moves with the same evaluation
            const numMoves = bestMoveArray.length;
            const i = Math.floor(Math.random() * numMoves);
            const bestMove = bestMoveArray[i];

            // Execute move!
            this.moveHandler(
                current,
                bestMove.piece.id,
                bestMove.piece.flatChessCoords,
                bestMove.move,
            );
        };

        moveSelector();
    }

    // For fun board styling
    dragStartHandler(e, piece) {
        // Just make sure no glitches happen
        if (isEmpty(piece) || piece === undefined) {
            return;
        }

        // Only let styling happen for white bc we are playing a computer
        if (!piece.white) {
            return;
        }

        // Don't do anything if the game is over
        if (this.state.endGame) {
            return;
        }

        // Don't do anything if someone resigned
        const { resignation } = this.props;
        if (resignation.all) {
            return;
        }

        // Get reference to current board configuration
        const history = this.state.history;
        const { boardConfig } = history[this.state.stepNumber];

        // First thing is to initialize pieces to board
        for (let col = 0; col < 8; col++) {
            for (let row = 0; row < 8; row++) {
                const chesscoords = convertNotation([col, row]);
                const coords = boardStateConverter([col, row]);
                const ourPiece = boardConfig[coords[0]][coords[1]];

                if (!isEmpty(ourPiece)) {
                    positionValidator(ourPiece, chesscoords);
                }
            }
        }

        // Initialize
        this.draggingPieceMoveable = [];
        this.draggingPiece = piece;
        const originSquare = piece.flatChessCoords;

        // If we are not viewing up-to-date board, return
        if (this.state.stepNumber !== history.length - 1) {
            return;
        }

        // If it isn't your turn, return
        if (this.draggingPiece.white !== this.state.whiteIsNext) {
            return;
        }

        // Cycle through every tile to see valid moves
        for (let col = 0; col < 8; col++) {
            for (let row = 0; row < 8; row++) {
                // Get reference to tile and test move
                let tile = convertNotation([col, row]).join("");
                const tileElement = document.querySelector(`#${tile}`);

                let finalResult = chessMove(
                    tile,
                    originSquare,
                    this.draggingPiece,
                    boardConfig,
                );

                // If a move to this tile is valid, we will add style to tile
                if (finalResult.validMove) {
                    this.draggingPieceMoveable.push(tileElement);
                }
            }
        }

        // Search the valid moves of whatever we are dragging
        for (let i = 0; i < this.draggingPieceMoveable.length; i++) {
            // Get reference to piece
            const curElement = this.draggingPieceMoveable[i];
            const tilePiece = getPieceWithDom(curElement, boardConfig);

            // If there's no piece on tile, give green dot
            if (isEmpty(tilePiece)) {
                curElement.classList.add("moveable");
            } else {
                // Else, color the corners
                if (curElement.parentNode.classList.contains("light-square")) {
                    curElement.classList.add(
                        "moveable-capturable-light-square",
                    );
                } else if (
                    curElement.parentNode.classList.contains("dark-square")
                ) {
                    curElement.classList.add("moveable-capturable-dark-square");
                }

                curElement.parentNode.classList.add(
                    "moveable-capturable-parent",
                );
            }
        }
    }

    // Resets board (also custom starting positions)
    setUpBoard() {
        const chessboard = document.querySelector("#chessboard-backdrop");
        const newGameBtn = document.querySelector("#newGame-btn");
        const userFeedback = document.querySelector(".user-feedback");
        chessboard.style.filter = "grayscale(0%)";
        newGameBtn.style.visibility = "hidden";
        userFeedback.innerHTML = "";

        // Reset styles
        for (let col = 0; col < 8; col++) {
            for (let row = 0; row < 8; row++) {
                const tile = convertNotation([col, row]).join("");
                const tileElement = document.querySelector(`#${tile}`);
                tileElement.classList.remove(
                    "involved-in-last-move-tile-light-square",
                );
                tileElement.classList.remove(
                    "involved-in-last-move-tile-dark-square",
                );
                tileElement.parentElement.classList.remove("light-tile-check");
                tileElement.parentElement.classList.remove("dark-tile-check");
            }
        }

        // Remakes all pieces
        let R1 = new Rook(this.props, "R");
        let N1 = new Knight(this.props, "N");
        let B1 = new Bishop(this.props, "B");
        let Q1 = new Queen(this.props, "Q");
        let K1 = new King(this.props, "K");
        let B2 = new Bishop(this.props, "B");
        let N2 = new Knight(this.props, "N");
        let R2 = new Rook(this.props, "R");
        let P1 = new Pawn(this.props, "P");
        let P2 = new Pawn(this.props, "P");
        let P3 = new Pawn(this.props, "P");
        let P4 = new Pawn(this.props, "P");
        let P5 = new Pawn(this.props, "P");
        let P6 = new Pawn(this.props, "P");
        let P7 = new Pawn(this.props, "P");
        let P8 = new Pawn(this.props, "P");

        let r1 = new Rook(this.props, "r");
        let n1 = new Knight(this.props, "n");
        let b1 = new Bishop(this.props, "b");
        let q1 = new Queen(this.props, "q");
        let k1 = new King(this.props, "k");
        let b2 = new Bishop(this.props, "b");
        let n2 = new Knight(this.props, "n");
        let r2 = new Rook(this.props, "r");
        let p1 = new Pawn(this.props, "p");
        let p2 = new Pawn(this.props, "p");
        let p3 = new Pawn(this.props, "p");
        let p4 = new Pawn(this.props, "p");
        let p5 = new Pawn(this.props, "p");
        let p6 = new Pawn(this.props, "p");
        let p7 = new Pawn(this.props, "p");
        let p8 = new Pawn(this.props, "p");

        //prettier-ignore
        const whiteCollection = [R1,N1,B1,Q1,K1,B2,N2,R2,P1,P2,P3,P4,P5,P6,P7,P8];

        //prettier-ignore
        const blackCollection = [r1,n1,b1,q1,k1,b2,n2,r2,p1,p2,p3,p4,p5,p6,p7,p8];

        // Initial board configuration, edit to experiment with positions
        const boardConfig = [
            [r1, n1, b1, q1, k1, b2, n2, r2],
            [p1, p2, p3, p4, p5, p6, p7, p8],
            [{}, {}, {}, {}, {}, {}, {}, {}],
            [{}, {}, {}, {}, {}, {}, {}, {}],
            [{}, {}, {}, {}, {}, {}, {}, {}],
            [{}, {}, {}, {}, {}, {}, {}, {}],
            [P1, P2, P3, P4, P5, P6, P7, P8],
            [R1, N1, B1, Q1, K1, B2, N2, R2],
        ];

        // Test boards
        const boardConfig1 = [
            [{}, {}, {}, {}, k1, {}, {}, {}],
            [{}, {}, {}, {}, {}, {}, {}, {}],
            [{}, {}, {}, {}, {}, {}, {}, {}],
            [{}, {}, {}, {}, {}, {}, {}, {}],
            [{}, {}, {}, {}, {}, {}, {}, {}],
            [{}, {}, {}, {}, {}, {}, {}, {}],
            [{}, {}, p1, {}, {}, {}, {}, {}],
            [{}, {}, {}, {}, K1, {}, {}, {}],
        ];

        const boardConfig2 = [
            [{}, {}, {}, {}, k1, {}, {}, {}],
            [{}, {}, {}, {}, {}, {}, {}, {}],
            [{}, {}, {}, {}, {}, {}, {}, {}],
            [{}, {}, {}, {}, {}, {}, {}, {}],
            [{}, {}, {}, {}, {}, {}, {}, {}],
            [{}, {}, {}, {}, {}, {}, {}, {}],
            [{}, {}, {}, {}, {}, {}, {}, {}],
            [{}, {}, {}, {}, K1, B2, N2, R2],
        ];

        this.whitePieces = whiteCollection;
        this.blackPieces = blackCollection;
        this.allPieces = whiteCollection.concat(blackCollection);

        // Reset Resign and Draw Offer options
        const { resetResignAndOfferDraw } = this.props;
        resetResignAndOfferDraw();

        // Initializes starting board configuration and piece collections
        this.setState({
            history: [{ boardConfig }],
            stepNumber: 0,
            whiteIsNext: true,
            endGame: false,
        });
    }

    // Move backwards btn
    moveBack(e) {
        // Remove stylings on board
        for (let col = 0; col < 8; col++) {
            for (let row = 0; row < 8; row++) {
                const tile = convertNotation([col, row]).join("");
                const tileElement = document.querySelector(`#${tile}`);
                tileElement.classList.remove(
                    "involved-in-last-move-tile-light-square",
                );
                tileElement.classList.remove(
                    "involved-in-last-move-tile-dark-square",
                );
                tileElement.parentElement.classList.remove("light-tile-check");
                tileElement.parentElement.classList.remove("dark-tile-check");
            }
        }

        // Decrement step number and set state
        if (this.state.stepNumber > 0) {
            this.setState({
                stepNumber: this.state.stepNumber - 1,
            });
        }
    }

    // Move forward btn
    moveForward(e) {
        // Increment step numbers
        if (this.state.stepNumber < this.state.history.length - 1) {
            this.setState({
                stepNumber: this.state.stepNumber + 1,
            });
        }
    }

    // Self-explanatory
    rotateBoard() {
        // Do a 180
        const { rotation } = this.state;
        const newDegrees = (rotation + 180) % 360;
        this.setState({
            rotation: newDegrees,
        });
    }

    render() {
        const history = this.state.history;
        const current = history[this.state.stepNumber];

        //displays whatever we set 'current' to
        return (
            <div id="chess-app" className="major-comp">
                <div id="interface-container" className="major-comp">
                    <Chessboard
                        rotation={this.state.rotation}
                        boardConfig={current.boardConfig}
                        playerTurn={this.state.whiteIsNext}
                        lastMoveSquares={this.lastMoveSquares}
                        onMove={this.moveHandler}
                        onDragStart={this.dragStartHandlerProp}
                    />
                    <UserInterface
                        turn={this.state.whiteIsNext}
                        history={history}
                        moveForward={this.moveForward}
                        moveBack={this.moveBack}
                        rotateBoard={this.rotateBoard}
                        newGame={this.setUpBoard}
                        openRules={this.props.openRules}
                    />
                </div>
            </div>
        );
    }
}

export default ChessApp;
