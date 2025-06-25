
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, Chat, GenerateContentResponse } from "@google/genai";

// DOM Elements
const startButton = document.getElementById('startButton') as HTMLButtonElement;
const gameArea = document.getElementById('game-area') as HTMLDivElement;
const nextKanaDisplay = document.getElementById('next-kana') as HTMLSpanElement;
const currentWordTextDisplay = document.getElementById('current-word-text') as HTMLHeadingElement;
const playerInput = document.getElementById('player-input') as HTMLInputElement;
const gameMessage = document.getElementById('game-message') as HTMLParagraphElement;
const wordHistoryUl = document.getElementById('word-history') as HTMLUListElement;
const playerTimeRemainingDisplay = document.getElementById('player-time-remaining') as HTMLSpanElement;
const previousWordDisplay = document.getElementById('previous-word-display') as HTMLSpanElement;

const scoreDisplayArea = document.getElementById('score-display-area') as HTMLDivElement;
const playerScoreDisplay = document.getElementById('player-score-display') as HTMLParagraphElement;
const highScoreDisplay = document.getElementById('high-score-display') as HTMLParagraphElement;

// Game Config
const AI_MODEL_NAME = 'gemini-2.5-flash-preview-04-17';
const PLAYER_TOTAL_TIME_SECONDS = 60;
const AI_TURN_TIME_LIMIT_MS = 15000;
const MIN_WORD_LENGTH = 2;
const HIGH_SCORE_STORAGE_KEY = 'shiritoriNeoHighScore';

// Game State
let ai: GoogleGenAI;
let chat: Chat | null = null;
let currentWord: string = '';
let currentLinkingKana: string = ''; // Will always be a large Hiragana
let wordHistory: string[] = [];
let isPlayerTurn: boolean = false;
let gameOver: boolean = false;
let playerTimeRemaining: number = PLAYER_TOTAL_TIME_SECONDS;
let playerTimerIntervalId: ReturnType<typeof setInterval> | null = null;
let aiTurnTimeoutId: ReturnType<typeof setTimeout> | null = null;
let playerTypedCharactersCount: number = 0;

const smallToLargeKanaMap: { [key: string]: string } = {
  'ぁ': 'あ', 'ぃ': 'い', 'ぅ': 'う', 'ぇ': 'え', 'ぉ': 'お',
  'ゃ': 'や', 'ゅ': 'ゆ', 'ょ': 'よ', 'ゎ': 'わ', 'っ': 'つ',
  'ァ': 'ア', 'ィ': 'イ', 'ゥ': 'ウ', 'ェ': 'エ', 'ォ': 'オ',
  'ャ': 'ヤ', 'ュ': 'ユ', 'ョ': 'ヨ', 'ヮ': 'ワ', 'ッ': 'ツ',
  'ヵ': 'カ', 'ヶ': 'ケ'
};

function convertToLargeKana(char: string): string {
  return smallToLargeKanaMap[char] || char;
}

function katakanaToHiragana(char: string): string {
  if (!char) return '';
  const code = char.charCodeAt(0);
  // Check if it's within the Katakana Unicode block
  if (code >= 0x30A1 && code <= 0x30F6) { // Common Katakana range ァ to ヶ
    return String.fromCharCode(code - 0x60); // Subtract 0x60 to get Hiragana
  }
  return char; // Return original if not Katakana
}

function normalizeCharToLargeHiragana(char: string): string {
    if (!char) return '';
    const largeKana = convertToLargeKana(char);
    return katakanaToHiragana(largeKana);
}


function initializeGame() {
  if (!process.env.API_KEY) {
    displayMessage('APIキーが設定されていません。環境変数を確認してください。', true);
    startButton.disabled = true;
    playerInput.disabled = true;
    return;
  }
  ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  startButton.addEventListener('click', startGame);
  playerInput.addEventListener('keypress', (event) => {
    if (event.key === 'Enter' && !playerInput.disabled) {
      handlePlayerSubmit();
    }
  });
  loadHighScore();
}

function loadHighScore() {
  try {
    const storedHighScore = localStorage.getItem(HIGH_SCORE_STORAGE_KEY);
    if (storedHighScore) {
      highScoreDisplay.textContent = `最高記録: ${storedHighScore}文字`;
    } else {
      highScoreDisplay.textContent = `最高記録: 0文字`;
    }
  } catch (e) {
    console.error("Failed to load high score from localStorage:", e);
    highScoreDisplay.textContent = `最高記録: (読込不可)`;
  }
}

function saveHighScore(score: number) {
  try {
    const storedHighScore = parseInt(localStorage.getItem(HIGH_SCORE_STORAGE_KEY) || '0');
    if (score > storedHighScore) {
      localStorage.setItem(HIGH_SCORE_STORAGE_KEY, score.toString());
      highScoreDisplay.textContent = `最高記録: ${score}文字 (新記録!)`;
      highScoreDisplay.classList.add('new-record');
    } else {
       highScoreDisplay.classList.remove('new-record');
    }
  } catch (e) {
    console.error("Failed to save or read high score from localStorage:", e);
    // Optionally, inform the user if saving failed, or just log.
    // highScoreDisplay might show an optimistic update if setItem fails.
    // Consider how to handle this - for now, just logging.
  }
}

async function startGame() {
  gameOver = false;
  wordHistory = [];
  currentWord = '';
  currentLinkingKana = '';
  isPlayerTurn = false;
  playerTypedCharactersCount = 0;
  
  clearTimers();
  playerTimeRemaining = PLAYER_TOTAL_TIME_SECONDS;
  playerTimeRemainingDisplay.textContent = playerTimeRemaining.toString();

  gameArea.classList.remove('hidden');
  scoreDisplayArea.classList.add('hidden');
  startButton.textContent = 'リセットして再挑戦';
  startButton.disabled = false; 

  updateWordHistoryUI();
  displayMessage('ゲーム開始！最初の言葉(2文字以上)を入力し、Enterキーで送信してください。', false);
  currentWordTextDisplay.textContent = '---';
  previousWordDisplay.textContent = 'なし';
  nextKanaDisplay.textContent = '?';
  
  try {
    chat = ai.chats.create({
      model: AI_MODEL_NAME,
      config: {
        systemInstruction: `あなたはしりとりゲームのAIです。プレイヤーと日本語のしりとりをします。
厳守すべきルールは以下の通りです:
1. 単語は最低${MIN_WORD_LENGTH}文字である必要があります。
2. 単語はひらがなまたはカタカナのみ使用可能です（例: りんご, コンピューター）。
3. **最重要ルール: 「ん」または「ン」で終わる単語は絶対に使用禁止です。もし使用した場合はあなたの即負けとなります。これは絶対に守ってください。**
4. 常に、前の単語の最後の有効な文字から導き出された「開始ひらがな（大きい文字）」をこちらから指定します。あなたの単語の最初の文字は、この指定された「開始ひらがな」と音韻的に一致する必要があります。あなたの単語がひらがなで書かれていればその文字、カタカナで書かれていれば対応するカタカナ文字で開始してください。（例：指定された開始ひらがなが「あ」なら、あなたの単語は「あ」または「ア」で始まる必要があります。）
5. 既に使われた単語（${wordHistory.map(w => w.split(': ')[1]).join(', ')}）は使用できません。
6. あなたは${AI_TURN_TIME_LIMIT_MS / 1000}秒以内に返答しなければなりません。
7. 単語は「を」や「ヲ」で終わってはいけません。
8. 同じ文字が3つ以上連続して終わる単語（例：あああ）は使用禁止です。
9. 同じ言葉の単純な繰り返し（例：モグモグ、きらきら）は使用禁止です。
一般的な名詞を答えるようにしてください。常に単語のみを返してください。記号や句読点は含めないでください。`,
      },
    });
    setTurn(true); // Player's turn to input the very first word
  } catch (error) {
    console.error("Error starting game or creating chat:", error);
    displayMessage("ゲームの開始に失敗しました。AIとの通信エラーかもしれません。", true);
    endGame("AIエラーでゲーム終了。");
  }
}

function getLastKana(word: string): string {
  if (!word || word.length === 0) return '';
  
  let effectiveLastChar: string;
  const lastChar = word.slice(-1);

  if (lastChar === 'ー') {
    if (word.length >= 2) { 
      effectiveLastChar = word.slice(-2, -1);
    } else {
      return ''; 
    }
  } else {
    effectiveLastChar = lastChar;
  }
  
  // Convert to large kana first, then to Hiragana
  const largeKana = convertToLargeKana(effectiveLastChar);
  return katakanaToHiragana(largeKana);
}


function validatePlayerWord(playerWord: string): { isValid: boolean, message: string, word: string } {
  const trimmedWord = playerWord.trim();
  if (!trimmedWord) {
    return { isValid: false, message: '言葉を入力してください。', word: trimmedWord };
  }
  if (!/^[ぁ-んァ-ンヴー]+$/.test(trimmedWord)) { 
    return { isValid: false, message: 'ひらがなまたはカタカナで入力してください。', word: trimmedWord };
  }
  if (trimmedWord.length < MIN_WORD_LENGTH) {
    return { isValid: false, message: `${MIN_WORD_LENGTH}文字以上の言葉を入力してください。`, word: trimmedWord };
  }
  if (trimmedWord.slice(-1) === 'ん' || trimmedWord.slice(-1) === 'ン') {
    return { isValid: false, message: '「ん」で終わる言葉は使えません！あなたの負けです。', word: trimmedWord };
  }
  // Rule: Check for 'を' or 'ヲ' at the end
  if (trimmedWord.slice(-1) === 'を' || trimmedWord.slice(-1) === 'ヲ') {
    return { isValid: false, message: 'ルール違反: 「を」または「ヲ」で終わる言葉はしりとりでは使えません。別の言葉を入力してください。', word: trimmedWord };
  }
  // Rule: Check for three or more identical consecutive characters at the end
  if (trimmedWord.length >= 3) {
    const lastChar = trimmedWord.slice(-1);
    const secondLastChar = trimmedWord.slice(-2, -1);
    const thirdLastChar = trimmedWord.slice(-3, -2);
    if (lastChar === secondLastChar && lastChar === thirdLastChar) {
      return { isValid: false, message: 'ルール違反: 同じ文字が3つ以上連続して終わる言葉は使えません。別の言葉を入力してください。', word: trimmedWord };
    }
  }
  // Rule: Check for repetitive onomatopoeia like "モグモグ", "むしゃむしゃ" (S+S pattern)
  // The repeated sequence S must be at least MIN_WORD_LENGTH.
  if (trimmedWord.length >= 2 * MIN_WORD_LENGTH && trimmedWord.length % 2 === 0) {
    const halfLength = trimmedWord.length / 2;
    const firstHalf = trimmedWord.substring(0, halfLength);
    const secondHalf = trimmedWord.substring(halfLength);
    if (firstHalf === secondHalf) {
      return { isValid: false, message: 'ルール違反: 同じ言葉の繰り返し（例: モグモグ、むしゃむしゃ）は使えません。別の言葉を入力してください。', word: trimmedWord };
    }
  }

  if (wordHistory.map(w => w.split(': ')[1]).includes(trimmedWord)) {
    return { isValid: false, message: 'その言葉は既に使用されています。', word: trimmedWord };
  }

  // currentLinkingKana is always large Hiragana
  if (currentLinkingKana) {
    const playerFirstCharNormalized = normalizeCharToLargeHiragana(trimmedWord.charAt(0));
    if (playerFirstCharNormalized !== currentLinkingKana) {
      return { isValid: false, message: `「${currentLinkingKana}」で始まる言葉を入力してください。（あなたの入力「${trimmedWord.charAt(0)}」は「${playerFirstCharNormalized}」と解釈されました）`, word: trimmedWord };
    }
  }
  return { isValid: true, message: '良い言葉です！', word: trimmedWord };
}

async function handlePlayerSubmit() {
  if (!isPlayerTurn || gameOver) return;

  const playerWordInput = playerInput.value;
  const validation = validatePlayerWord(playerWordInput);

  if (!validation.isValid) {
    displayMessage(validation.message, true);
    if (validation.message.includes("あなたの負けです")) {
        endGame(validation.message);
    }
    return;
  }
  
  if (wordHistory.length > 0 && playerTimerIntervalId) {
    stopPlayerTimer();
  }
  
  const validPlayerWord = validation.word;

  displayMessage(validation.message, false);
  addWordToHistory(validPlayerWord, "あなた");
  playerTypedCharactersCount += validPlayerWord.length;

  currentWord = validPlayerWord;
  currentLinkingKana = getLastKana(validPlayerWord); // This will be large Hiragana
  
  if (!currentLinkingKana) { 
    endGame(`あなたが提出した言葉「${validPlayerWord}」から次の文字を特定できませんでした。あなたの負けです。`);
    return;
  }

  updateUIForNewWord();
  playerInput.value = '';
  setTurn(false); // AI's turn

  if (aiTurnTimeoutId) clearTimeout(aiTurnTimeoutId);
  aiTurnTimeoutId = setTimeout(() => {
    if (!isPlayerTurn && !gameOver) { 
      endGame("AIが15秒以内に応答しませんでした。あなたの勝ちです！");
    }
  }, AI_TURN_TIME_LIMIT_MS);

  // currentLinkingKana is already the target large Hiragana for the AI
  const aiResponse = await getAIWord(
    `直前の単語は「${validPlayerWord}」でした。次の単語は「${currentLinkingKana}」という音で始まる、${MIN_WORD_LENGTH}文字以上で、ひらがなまたはカタカナの一般的な名詞を一つだけ答えてください。これまでに使われた単語（${wordHistory.map(w => w.split(': ')[1]).join(', ')}）は避けてください。単語のみを返してください。**重要: あなたの回答は絶対に「ん」または「ン」で終わってはいけません。これはしりとりの最重要ルールであり、違反すると即座にあなたの負けとなります。また、ルール7,8,9（「を/ヲ」で終わらない、末尾3文字同字禁止、S+S繰り返し禁止）も遵守してください。**`
  );
  
  if (aiTurnTimeoutId) clearTimeout(aiTurnTimeoutId); 
  aiTurnTimeoutId = null;

  if (gameOver) return; 

  if (aiResponse) {
    processAIsWord(aiResponse);
  } else {
    if (!gameOver) endGame("AIが言葉を見つけられませんでした。あなたの勝ちです！");
  }
}

async function getAIWord(prompt: string): Promise<string | null> {
  if (!chat) {
    displayMessage("チャットセッションが初期化されていません。", true);
    endGame("AIエラー: チャット未初期化");
    return null;
  }
  try {
    const response = await chat.sendMessage({ message: prompt });    
    const aiText = response.text.trim();
    
    if (aiText && /^[ぁ-んァ-ンヴー]+$/.test(aiText) && !aiText.includes(" ") && aiText.length >= MIN_WORD_LENGTH) {
        if (currentLinkingKana) {
            const aiFirstCharNormalized = normalizeCharToLargeHiragana(aiText.charAt(0));
            if (aiFirstCharNormalized !== currentLinkingKana) {
                 console.warn(`AI returned word "${aiText}" starting with ${aiText.charAt(0)} (normalized: ${aiFirstCharNormalized}), but expected ${currentLinkingKana}.`);
                 // Return it anyway for processAIsWord to handle and declare player win if AI is wrong
                 return aiText; 
            }
        }
      return aiText;
    } else {
      console.warn("AI returned an unexpected format or invalid word:", aiText);
      // Attempt to extract a valid word if AI includes extra text
      const potentialWords = aiText.match(/[ぁ-んァ-ンヴー]+/g);
      if (potentialWords) {
        for (const word of potentialWords) {
            if (word.length >= MIN_WORD_LENGTH && 
                (word.slice(-1) !== 'ん' && word.slice(-1) !== 'ン')) {
                // Further check AI's own adherence to its other rules
                if (word.slice(-1) === 'を' || word.slice(-1) === 'ヲ') continue;
                if (word.length >= 3) {
                  const last = word.slice(-1);
                  const secondLast = word.slice(-2, -1);
                  const thirdLast = word.slice(-3, -2);
                  if (last === secondLast && last === thirdLast) continue;
                }
                if (word.length >= 2 * MIN_WORD_LENGTH && word.length % 2 === 0) {
                  const halfLen = word.length / 2;
                  if (word.substring(0, halfLen) === word.substring(halfLen)) continue;
                }

                if (currentLinkingKana) {
                    const firstCharNorm = normalizeCharToLargeHiragana(word.charAt(0));
                    if (firstCharNorm === currentLinkingKana) return word;
                } else { 
                    return word;
                }
            }
        }
      }
      displayMessage("AIの応答が期待した単語の形式でないか、ルール違反の可能性があります。", true);
      return null; 
    }
  } catch (error) {
    console.error("Error getting word from AI:", error);
    displayMessage("AIとの通信中にエラーが発生しました。", true);
    return null;
  }
}

function processAIsWord(aiWord: string) {
  if (gameOver) return; 

  const aiFirstCharRaw = aiWord.charAt(0);
  const aiFirstCharNormalized = normalizeCharToLargeHiragana(aiFirstCharRaw);

  if (currentLinkingKana && aiFirstCharNormalized !== currentLinkingKana) { 
    addWordToHistory(aiWord, "AI"); 
    endGame(`AIがルール違反！「${aiWord}」(開始文字: ${aiFirstCharRaw} -> ${aiFirstCharNormalized})は「${currentLinkingKana}」で始まっていません。あなたの勝ち！`);
    return;
  }

  if (aiWord.length < MIN_WORD_LENGTH) {
    addWordToHistory(aiWord, "AI");
    endGame(`AIが${MIN_WORD_LENGTH}文字未満の言葉「${aiWord}」を出しました！あなたの勝ちです！`);
    return;
  }
  if (aiWord.slice(-1) === 'ん' || aiWord.slice(-1) === 'ン') {
    addWordToHistory(aiWord, "AI");
    endGame(`AIが「ん」で終わる言葉「${aiWord}」を出しました！あなたの勝ちです！`);
    return;
  }
   if (aiWord.slice(-1) === 'を' || aiWord.slice(-1) === 'ヲ') {
    addWordToHistory(aiWord, "AI");
    endGame(`AIが「を」または「ヲ」で終わる言葉「${aiWord}」を出しました！あなたの勝ちです！`);
    return;
  }
  if (aiWord.length >= 3) {
    const lastChar = aiWord.slice(-1);
    const secondLastChar = aiWord.slice(-2, -1);
    const thirdLastChar = aiWord.slice(-3, -2);
    if (lastChar === secondLastChar && lastChar === thirdLastChar) {
      addWordToHistory(aiWord, "AI");
      endGame(`AIが同じ文字が3つ以上連続して終わる言葉「${aiWord}」を出しました！あなたの勝ちです！`);
      return;
    }
  }
  if (aiWord.length >= 2 * MIN_WORD_LENGTH && aiWord.length % 2 === 0) {
    const halfLength = aiWord.length / 2;
    const firstHalf = aiWord.substring(0, halfLength);
    const secondHalf = aiWord.substring(halfLength);
    if (firstHalf === secondHalf) {
      addWordToHistory(aiWord, "AI");
      endGame(`AIが同じ言葉の繰り返し（例: モグモグ）「${aiWord}」を出しました！あなたの勝ちです！`);
      return;
    }
  }
  if (wordHistory.map(w => w.split(': ')[1]).includes(aiWord)) {
    addWordToHistory(aiWord, "AI");
    endGame(`AIが既に使われた言葉「${aiWord}」を出しました！あなたの勝ちです！`);
    return;
  }
   if (!/^[ぁ-んァ-ンヴー]+$/.test(aiWord)) {
    addWordToHistory(aiWord, "AI");
    endGame(`AIが無効な文字を含む言葉「${aiWord}」を出しました！あなたの勝ちです！`);
    return;
  }

  addWordToHistory(aiWord, "AI");
  currentWord = aiWord;
  currentLinkingKana = getLastKana(aiWord); // This will be large Hiragana

  if (!currentLinkingKana) { 
      endGame("AIが無効な単語「" + aiWord + "」を出したため次の文字を特定できませんでした。あなたの勝ちです！");
      return;
  }

  updateUIForNewWord();
  setTurn(true); // Player's turn
  
  startPlayerTimer(); 
  displayMessage('あなたの番です。Enterキーで送信してください。', false);
}


function setTurn(isPlayer: boolean) {
  isPlayerTurn = isPlayer;
  if (isPlayer) {
    playerInput.disabled = gameOver; 
    if (!gameOver) playerInput.focus();
  } else {
    playerInput.disabled = true;
  }
}

function addWordToHistory(word: string, player: "あなた" | "AI") {
  const entry = `${player}: ${word}`;
  wordHistory.push(entry);
  updateWordHistoryUI();
}

function updateWordHistoryUI() {
  wordHistoryUl.innerHTML = '';
  wordHistory.forEach(entry => {
    const li = document.createElement('li');
    li.textContent = entry;
    wordHistoryUl.appendChild(li);
  });
  wordHistoryUl.scrollTop = wordHistoryUl.scrollHeight;
}

function updateUIForNewWord() {
  currentWordTextDisplay.textContent = currentWord;
  previousWordDisplay.textContent = wordHistory.length > 1 ? wordHistory[wordHistory.length-2].split(': ')[1] : (wordHistory.length === 1 ? wordHistory[0].split(': ')[1] : 'なし');
  nextKanaDisplay.textContent = currentLinkingKana; // This is now always large Hiragana
  updateWordHistoryUI(); 
}

function displayMessage(message: string, isError: boolean) {
  gameMessage.textContent = message;
  gameMessage.className = isError ? 'error' : 'success';
}

function clearTimers() {
    if (playerTimerIntervalId !== null) {
        clearInterval(playerTimerIntervalId);
        playerTimerIntervalId = null;
    }
    if (aiTurnTimeoutId !== null) {
        clearTimeout(aiTurnTimeoutId);
        aiTurnTimeoutId = null;
    }
}

function startPlayerTimer() {
  if (gameOver) return;
  if (playerTimerIntervalId !== null) clearInterval(playerTimerIntervalId); 

  playerTimerIntervalId = setInterval(() => {
    playerTimeRemaining--;
    playerTimeRemainingDisplay.textContent = playerTimeRemaining.toString();
    if (playerTimeRemaining <= 0) {
      endGame("時間切れです！あなたの負けです。");
    }
  }, 1000);
}

function stopPlayerTimer() {
  if (playerTimerIntervalId !== null) {
    clearInterval(playerTimerIntervalId);
    playerTimerIntervalId = null;
  }
}

function endGame(message: string) {
  if (gameOver) return; 
  gameOver = true;
  
  clearTimers();
  displayMessage(message, false); 
  setTurn(false); 
  playerInput.disabled = true;
  startButton.disabled = false; 
  startButton.textContent = 'もう一度遊ぶ';

  scoreDisplayArea.classList.remove('hidden');
  playerScoreDisplay.textContent = `あなたがタイプした総文字数: ${playerTypedCharactersCount}`;
  saveHighScore(playerTypedCharactersCount);
  loadHighScore(); 
}

// Initialize
initializeGame();
