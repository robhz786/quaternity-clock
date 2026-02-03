
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

class QuaternityPlayerClockDisplay {
    constructor(time_sec, additionPerRound_sec) {
        this.onGame = true;
        this._remainingTime_ms = time_sec * 1000.0;
        this._additionPerRound_ms = additionPerRound_sec * 1000.0;
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

class QuaternityClock {
    constructor(players, statusUI) {
        this._players = players;
        this._ui = statusUI;
        for (let i in this._players) {
            this._players[i].onGame = true;
            this._ui.UnhighlightPlayer(i);
        }
        this._ui.HighlightPlayer(0);

        this._activePlayersCount = 4 ;
        this._currentPlayerIdx = 0;
        this._currentPlayer = this._players[0];

        this._previousTimestamp = 0;
        this._thresholdTimestamp = 0.0;
        this._ThresholdTimeCallback = null;
    }

    _RequestAnimationFrame()
    {
        const cb = (timestamp) => { this._AnimNewFrameCallback(timestamp); };
        window.requestAnimationFrame(cb);
    }

    _AnimNewFrameCallback(timestamp) {
        if (timestamp >= this._thresholdTimestamp) {
            this._ThresholdTimeCallback(timestamp);
        } else if (this._IsCurrentPlayerButtonPressed()) {
            this._OnPlayerButtonPressed(timestamp);
        } else {
            this._RequestAnimationFrame();
        }
    }

    _IsCurrentPlayerButtonPressed() {
         const gamepadsArray = navigator.getGamepads();
         if (gamepadsArray != null) {
             const gamepad = gamepadsArray[0];
             if (gamepad != null) {
                 const playerIdx = this._currentPlayerIdx;
                 const buttons = gamepad.buttons;
                 if (buttons.length >= 4) {
                     return ( (playerIdx == 0 && buttons[0].pressed) ||
                              (playerIdx == 1 && buttons[1].pressed) ||
                              (playerIdx == 2 && buttons[2].pressed) ||
                              (playerIdx == 3 && buttons[3].pressed) );
                 }
             }
         }
         return false;
     }

    _OnPlayerButtonPressed(timestamp) {
        const remainingTime = this._currentPlayer.OnMoveDone(timestamp - this._previousTimestamp);
        this._ui.UpdatePlayerRemainingTime(this._currentPlayerIdx, remainingTime);
        this._MoveToNextPlayer();

        this._Run(timestamp);
    }

    Pause() {
        this._thresholdTimestamp = 0;
        this._ThresholdTimeCallback = (timestamp)=>{ this._DoPause(timestamp) };
    }

    _DoPause(timestamp) {
        const elapsedTime = timestamp - this._previousTimestamp;
        const remainingTime = this._currentPlayer.SubtractTime(elapsedTime);
        if (remainingTime <= 0.0) {
            this._OnCurrentPlayerTimeOut();
        } else {
            let nextPlayerIdx = this.NextActivePlayerIdx(this._currentPlayerIdx);
            this._ui.AlertPause();
        }
    }

    Unpause(playerIdx) {
        if (playerIdx != this._currentPlayerIdx) {
            if (this._currentPlayer.onGame) {
                // add the extra time per move:
                const remainingTime_ms = this._currentPlayer.OnMoveDone(0);
                this._ui.UpdatePlayerRemainingTime(this._currentPlayerIdx, remainingTime_ms);
            }
            this._SwitchToPlayer(playerIdx)
        }
        this.UnpauseOnCurrentPlayer();
    }

    UnpauseOnCurrentPlayer() {
        this._ui.AlertRunning();
        this._thresholdTimestamp = 0;
        this._ThresholdTimeCallback = (timestamp)=>{ this._Run(timestamp)};
        this._RequestAnimationFrame();
    }

    DisablePlayer(idx) {
        if (0 <= idx && idx < this._players.length) {
            if (this._players[idx].onGame) {
                this._players[idx].onGame = false;
                --this._activePlayersCount;
                this._ui.DisablePlayer(idx);
            }
        }
    }

    ReEnablePlayer(idx) {
        if (0 <= idx && idx < this._players.length) {
            if (!this._players[idx].onGame) {
                this._players[idx].onGame = true;
                ++this._activePlayersCount;
                if (idx == this._currentPlayerIdx) {
                    this._ui.HighlightPlayer(idx);
                } else {
                    this._ui.UnhighlightPlayer(idx);
                }
            }
        }
    }

    PlayersAvailableForUnpausing() {
        if (this._activePlayersCount >= 2) {
            const nextPlayerIdx = this.NextActivePlayerIdx(this._currentPlayerIdx);
            if (this._currentPlayer.onGame) {
                return [this._currentPlayerIdx, nextPlayerIdx];
            }
            return [nextPlayerIdx];
        }
        return [];
    }

    _WhenCurrentPlayerDisplayedTimeMustBeIncremented(timestamp) {
        let elapsedTime = timestamp - this._previousTimestamp;
        this._previousTimestamp = timestamp;
        console.debug("----------------------------------------------------");
        console.debug("player[%d] time before = %f ms",
                      this._currentPlayerIdx,
                      this._currentPlayer.RemainingTime_ms());
        const remainingTime_ms = this._currentPlayer.SubtractTime(elapsedTime);
        console.debug("player[%d] time after = %f", this._currentPlayerIdx, remainingTime_ms);

        if (remainingTime_ms <= 0) {
            this._OnCurrentPlayerTimeOut();
            return;
        }
        this._ui.UpdatePlayerRemainingTime(this._currentPlayerIdx, remainingTime_ms);
        this._Run(timestamp);
    }

    _Run(timestamp) {
        this._previousTimestamp = timestamp;
        this._thresholdTimestamp = timestamp + this._HowLongToUpdateCurrentPlayerTimeAgain();
        this._ThresholdTimeCallback =
            (timestamp)=>{ this._WhenCurrentPlayerDisplayedTimeMustBeIncremented(timestamp) };
        this._RequestAnimationFrame();
    }

    _HowLongToUpdateCurrentPlayerTimeAgain() {
        const remainingTime_ms = this._currentPlayer.RemainingTime_ms();
        if (remainingTime_ms <= 1000.0) {
            return remainingTime_ms;
        }
        const d = remainingTime_ms - 1000.0 * Math.ceil(remainingTime_ms * 0.001 - 1.0);
        return d + 0.1;
    }

    _OnCurrentPlayerTimeOut() {
        playBeep(1.0);
        this._ui.SetPlayerRemainingTimeToZero(this._currentPlayerIdx);
        this._currentPlayer.onGame = false;
        --this._activePlayersCount;
        const gameOver = this._activePlayersCount < 2;
        this._ui.AlertPlayerLostByTime(this._currentPlayerIdx, gameOver);
    }

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
        // if (this._currentPlayer.RemainingTime_ms() == 0) {
        //     this._OnCurrentPlayerTimeOut();
        // }
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
};

