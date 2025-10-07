
function playBeep(duration_sec) {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain(); // To control volume

    oscillator.type = 'sine'; // Or 'square', 'sawtooth', 'triangle'
    oscillator.frequency.setValueAtTime(440, audioCtx.currentTime); // 440 Hz (A4)
    gainNode.gain.setValueAtTime(0.5, audioCtx.currentTime); // Set volume (0 to 1)

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    oscillator.start();
    oscillator.stop(audioCtx.currentTime + duration_sec);
}

class QuaternityPlayerClock {
    constructor(time_sec, additionPerRound_sec) {
        this.onGame = true;
        this._remainingTime_ms = time_sec * 1000;
        this._additionPerRound_ms = additionPerRound_sec * 1000;
    }

    RemainingTime_ms() {
        return this._remainingTime_ms;
    }
    OnMoveDone(elapsedTime_ms) {
        return this._DoAdvanceTime_ms(elapsedTime_ms, this._additionPerRound_ms);
    }
    SubtractTime(elapsedTime_ms) {
        return this._DoAdvanceTime_ms(elapsedTime_ms, 0);
    }
    _DoAdvanceTime_ms(subtraction_ms, addition_ms) {
        if (this._remainingTime_ms > subtraction_ms) {
            this._remainingTime_ms -= subtraction_ms;
            this._remainingTime_ms += addition_ms;
        } else {
            this._remainingTime_ms = 0;
        }
        return this._remainingTime_ms;
    }
}


// function CountActivePlayers(players) {
//     let count = 0;
//     for (let p of players) {
//         if (p.onGame) {
//             count++;
//         }
//     }
//     return count;
// }

class QuaternityGameClock {
    constructor(players, statusUI) {
        this._ui = statusUI;
        this._gamePaused = true;
        this._gameOver = false;
        this._activePlayersCount = 4 ;
        this._players = players;
        for (let i in this._players) {
            this._players[i].onGame = true;
            this._ui.UnhighlightPlayer(i);
        }
        this._currentPlayerIdx = 0;
        this._currentPlayer = this._players[0];
        this._ui.HighlightPlayer(0);
        this._lastTimePick = 0;
        this._intervalId = setInterval((self)=>{self._IntervalCallback(); }, 125, this);
    }

    _IntervalCallback() {
        if (this._gameOver) {
            this.CleanUp();
        } else if (!this._gamePaused) {
            if (this._currentPlayer !== undefined) {
                let elapsed = this._PickElapsedTime();
                let remainingTime_ms = this._currentPlayer.SubtractTime(elapsed);
                this._ui.UpdatePlayerRemainingTime(this._currentPlayerIdx, remainingTime_ms);
                if (remainingTime_ms <= 0) {
                    this._OnCurrentPlayerTimeOut();
                }
            }
        }
    }

    CleanUp() {
        if (this._intervalId >= 0) {
            clearInterval(this._intervalId);
            this._intervalId = -1;
        }
    }

    SwitchPauseState() {
        if (!this._gameOver) {
            if (this._gamePaused) {
                this.Unpause();
            } else {
                this.Pause();
            }
        }
    }

    Pause() {
        if (!this._gamePaused && !this._gameOver) {
            if (this._currentPlayer.SubtractTime(this._PickElapsedTime())) {
                this._gamePaused = true;
                let nextPlayerIdx = this.NextActivePlayerIdx(this._currentPlayerIdx);
                this._ui.AlertPause([this._currentPlayerIdx, nextPlayerIdx]);
            } else {
                this._OnCurrentPlayerTimeOut();
            }
        }
    }

    Unpause(playerIdx) {
        if (this._gamePaused && !this._gameOver && this._players[playerIdx].onGame) {
            if (playerIdx != this._currentPlayerIdx) {
                if (this._currentPlayer.onGame) {
                    // to add the extra time per move:
                    const remainingTime_ms = this._currentPlayer.OnMoveDone(0);
                    this._ui.UpdatePlayerRemainingTime(this._currentPlayerIdx, remainingTime_ms);
                }
                this._SwitchToPlayer(playerIdx)
            }
            this._gamePaused = false;
            this._ui.AlertRunning();
            this._lastTimePick = performance.now();
        }
    }

    DisablePlayer(idx) {
        if (this._gamePaused && !this._gameOver && 0 <= idx && idx < this._players.length) {
            if (this._players[idx].onGame) {
                this._players[idx].onGame = false;
                this._activePlayersCount--;
                this._ui.DisablePlayer(idx);
            }
            return this._PlayersAvailableForUnpausing();
        }
        return [];
    }

    ReEnablePlayer(idx) {
        if (this._gamePaused && !this._gameOver && 0 <= idx && idx < this._players.length) {
            if ( ! this._players[idx].onGame) {
                this._players[idx].onGame = true;
                ++this._activePlayersCount;
                if (idx == this._currentPlayerIdx) {
                    this._ui.HighlightPlayer(idx);
                } else {
                    this._ui.EnablePlayer(idx);
                }
            }
            return this._PlayersAvailableForUnpausing();
        }
    }

    _PlayersAvailableForUnpausing() {
        if (this._activePlayersCount >= 2) {
            const nextPlayerIdx = this.NextActivePlayerIdx(this._currentPlayerIdx)
            if (this._currentPlayer.onGame) {
                return [this._currentPlayerIdx, nextPlayerIdx];
            }
            return [nextPlayerIdx];
        }
        return [];
    }

    OnPlayerButtonPressed(buttonIdx) {
        if (! this._gamePaused && !this._gameOver && buttonIdx == this._currentPlayerIdx) {
            const remainingTime_ms = this._currentPlayer.OnMoveDone(this._PickElapsedTime());
            this._ui.UpdatePlayerRemainingTime(this._currentPlayerIdx, remainingTime_ms);
            if (remainingTime_ms > 0) {
                this._MoveToNextPlayer();
            } else {
                this._OnCurrentPlayerTimeOut();
            }
        }
    }

    _PickElapsedTime() {
        let now = performance.now();
        let elapsedTime_ms = now - this._lastTimePick;
        this._lastTimePick = now;
        return elapsedTime_ms;
    }

    _OnCurrentPlayerTimeOut() {
        playBeep(1.0);
        this._currentPlayer.onGame = false;
        this._activePlayersCount--;
        if (this._activePlayersCount <= 1) {
            this._gameOver = true;
            this._ui.AlertPlayerLostByTime(this._currentPlayerIdx, []);
        } else {
            this._gamePaused = true;
            let playerOutIdx = this._currentPlayerIdx;
            this._MoveToNextPlayer();
            let nextPlayerIdx = this._currentPlayerIdx;
            this._ui.AlertPlayerLostByTime(playerOutIdx, [nextPlayerIdx]);
        }
    }

//    _OnPlayerRemoved() {
//        this._activePlayersCount--;
//        if (this._activePlayersCount <= 1) {
//            this._ui.AlertGameOver();
//        }
//    }

    _MoveToNextPlayer() {
        this._SwitchToPlayer(this.NextActivePlayerIdx(this._currentPlayerIdx));
    }

    _SwitchToPlayer(playerIdx) {
        if (this._currentPlayer.onGame) {
            this._ui.UnhighlightPlayer(this._currentPlayerIdx);
        } else {
            this._ui.DisablePlayer(this._currentPlayerIdx);
        }
        this._currentPlayerIdx = playerIdx;
        this._currentPlayer = this._players[this._currentPlayerIdx];
        this._ui.HighlightPlayer(this._currentPlayerIdx);
        if (this._currentPlayer.RemainingTime_ms() == 0) {
            _OnCurrentPlayerTimeOut();
        }
    }

    NextActivePlayerIdx(idx) {
        do {
            idx++
            if (idx == this._players.length) {
                idx = 0;
            }
        } while (this._players[idx].onGame === false);
        return idx;
    }

    CurrentPlayerIdx() {
        return this._currentPlayerIdx;
    }

    IsPlayerActive(idx) {
        return this._players[idx].onGame;
    }
}
