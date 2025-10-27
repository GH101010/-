// main.js - full file with timing-tolerant scoring (cross-correlation alignment)
// Includes: stage rendering, game flow, recording, scoring with lag compensation,
// score persistence (localStorage), and stage button grade classes (50/70).

const stageGroups = [
  { name: "독케익", prefix: "D_", count: 16 },
  { name: "니니아", prefix: "N_", count: 8 },
  { name: "계춘회", prefix: "G_", count: 8 },
  { name: "샤메이", prefix: "S_", count: 8 }
];

const stageDisplayNames = {
  "D_1": "개띡군",
  "D_2": "꽈당큐",
  "D_3": "나 남부야 뷧치들아",
  "D_4": "두개떼곳 두개떼곳 두개떼곳",
  "D_5": "따랑해",
  "D_6": "뜌땨 끼뺫 엄벌기",
  "D_7": "레전드 고추 발동",
  "D_8": "말랑말랑 팔때기",
  "D_9": "아무튼 화난다고",
  "D_10": "오 구독 감사해 존나많이감사해",
  "D_11": "오이이 아이이 오이이이 아이이",
  "D_12": "와하",
  "D_13": "제이스딥초코브레드 이건 군침이 돌잖아",
  "D_14": "째송해여 째송해여",
  "D_15": "쭈고보료라 쭈고보료라",
  "D_16": "해파리 오징어 물고기",
  "N_1": "니아니아니아 알파피메일",
  "N_2": "뿌우뿌우",
  "N_3": "고추 물기",
  "N_4": "넌 쓰레기야",
  "N_5": "띠드버거가 머꼬시퍼요",
  "N_6": "산나비 리액션",
  "N_7": "잉어 붕어 잉어",
  "N_8": "못알아보겠냐고 자기야",
  "G_1": "너 개떡이라며",
  "G_2": "너도 춘식이다",
  "G_3": "크앙",
  "G_4": "만치즈 감사합니다",
  "G_5": "모라는거야",
  "G_6": "여러분들 바나나가 말랑말랑",
  "G_7": "쓰레기새끼",
  "G_8": "오빠야",
  "S_1": "샤메이 꼬리킥",
  "S_2": "독쓰앰",
  "S_3": "우리집 물고기는 개떡물고기",
  "S_4": "따라올 수 있겠나",
  "S_5": "삐요삐요삐요삐요 쿠아앙",
  "S_6": "고맙샤",
  "S_7": "유 퍼킹 이디엇",
  "S_8": "후아앙"
};

// UI elements
const mainScreen = document.getElementById('mainScreen');
const micTestScreen = document.getElementById('micTestScreen');
const stageScreen = document.getElementById('stageScreen');
const gameScreen = document.getElementById('gameScreen');

const goStageBtn = document.getElementById('goStageBtn');
const goMicTestBtn = document.getElementById('goMicTestBtn');
const micTestBackBtn = document.getElementById('micTestBackBtn');
const stageBackBtn = document.getElementById('stageBackBtn');
const gameBackBtn = document.getElementById('gameBackBtn');

const stageList = document.getElementById('stageList');
const currentSampleName = document.getElementById('currentSampleName');
const bestScoreLabel = document.getElementById('bestScoreLabel');

const playSampleBtn = document.getElementById('playSampleBtn');
const challengeBtn = document.getElementById('challengeBtn');
const sampleAudio = document.getElementById('sampleAudio');
const sampleProgress = document.getElementById('sampleProgress');
const sampleTime = document.getElementById('sampleTime');
const countdownDiv = document.getElementById('countdown');
const resultSection = document.getElementById('resultSection');
const overlapWave = document.getElementById('overlapWave');
const userAudio = document.getElementById('userAudio');
const userProgress = document.getElementById('userProgress');
const userTime = document.getElementById('userTime');
const scoreResult = document.getElementById('scoreResult');
const liveWave = document.getElementById('liveWave');
const fullProcessBar = document.getElementById('fullProcessBar');
const fullProcessTime = document.getElementById('fullProcessTime');

let mediaRecorder, audioChunks = [], userAudioBuffer = null, sampleAudioBuffer = null;
let liveWaveDrawing = false;

const chunkSize = 128;
const barGroup = 8;
const canvasLogicalWidth = 1000;
const canvasLogicalHeight = 200;

// stage state
let currentStageKey = null;
const THRESHOLD_GREEN = 50;
const THRESHOLD_GOLD = 70;

// --- navigation ---
function showScreen(screen) {
  [mainScreen, micTestScreen, stageScreen, gameScreen].forEach(div => div.classList.add('hidden'));
  screen.classList.remove('hidden');
}

goStageBtn.onclick = () => { showScreen(stageScreen); renderStageList(); };
goMicTestBtn.onclick = () => { showScreen(micTestScreen); startMicTest(); };
micTestBackBtn.onclick = () => { showScreen(mainScreen); stopMicTest(); };
stageBackBtn.onclick = () => { showScreen(mainScreen); };
gameBackBtn.onclick = () => { showScreen(stageScreen); resetGameUI(); renderStageList(); };

// --- persistence helpers ---
function getStoredScore(sampleName) {
  const v = localStorage.getItem('score_' + sampleName);
  return v ? Number(v) : null;
}

// update stage button classes based on thresholds
function updateStageButtonVisual(sampleName) {
  const score = getStoredScore(sampleName);
  const buttons = document.querySelectorAll(`button.stageBtn[data-sample="${sampleName}"]`);
  buttons.forEach(btn => {
    btn.classList.remove('cleared50', 'cleared70');
    if (score !== null && !isNaN(score)) {
      if (score >= THRESHOLD_GOLD) btn.classList.add('cleared70');
      else if (score >= THRESHOLD_GREEN) btn.classList.add('cleared50');
    }
  });
}

// render stage list and after DOM append update visuals
function renderStageList() {
  stageList.innerHTML = '';
  stageGroups.forEach(group => {
    const groupLabelDiv = document.createElement('div');
    groupLabelDiv.className = 'stage-row';
    groupLabelDiv.innerHTML = `<span class="person-label">${group.name}</span>`;
    stageList.appendChild(groupLabelDiv);

    for (let row = 0; row < Math.ceil(group.count / 8); row++) {
      const rowDiv = document.createElement('div');
      rowDiv.className = 'stage-row';
      for (let i = 1 + row * 8; i <= Math.min((row + 1) * 8, group.count); i++) {
        const sampleName = `${group.prefix}${i}`;
        const file = `samples/${group.prefix}${i}.mp3`;
        const btn = document.createElement('button');
        btn.textContent = `${i}`;
        btn.className = 'stageBtn';
        btn.dataset.sample = sampleName;
        btn.onclick = () => startGameScreen(sampleName, file);
        rowDiv.appendChild(btn);
      }
      stageList.appendChild(rowDiv);
    }
  });

  // update visuals after appending
  document.querySelectorAll('button.stageBtn[data-sample]').forEach(btn => {
    updateStageButtonVisual(btn.dataset.sample);
  });
}

// --- game screen entry & best score display ---
function startGameScreen(sampleName, file) {
  showScreen(gameScreen);
  currentStageKey = sampleName;
  const displayName = stageDisplayNames[sampleName] || sampleName;
  currentSampleName.innerText = displayName;
  sampleAudio.src = file;
  resetGameUI();
  updateCurrentStageBestScore(sampleName);
}

function updateCurrentStageBestScore(sampleName) {
  const score = getStoredScore(sampleName);
  if (score === null) bestScoreLabel.innerText = '최고 점수: --점';
  else bestScoreLabel.innerText = `최고 점수: ${score}점`;
}

// --- UI reset ---
function resetGameUI() {
  resultSection.classList.add('hidden');
  try { if (sampleAudio) sampleAudio.currentTime = 0; } catch (e) {}
  try { if (userAudio) userAudio.currentTime = 0; } catch (e) {}
  sampleProgress.value = 0;
  userProgress.value = 0;
  scoreResult.innerText = '';
  userTime.innerText = '';
  sampleTime.innerText = '';
  hideFullProcessBar();
}

// --- mic test ---
let testStream = null;
let testWaveDrawing = false;
function startMicTest() {
  const testWave = document.getElementById('testWave');
  testWaveDrawing = true;
  navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
    testStream = stream;
    const ctx = testWave.getContext('2d');
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const analyser = audioCtx.createAnalyser();
    const source = audioCtx.createMediaStreamSource(stream);
    source.connect(analyser);
    analyser.fftSize = 2048;
    const bufferLength = analyser.fftSize;
    const dataArray = new Uint8Array(bufferLength);
    function draw() {
      if (!testWaveDrawing) return;
      requestAnimationFrame(draw);
      analyser.getByteTimeDomainData(dataArray);
      ctx.clearRect(0, 0, testWave.width, testWave.height);
      ctx.beginPath();
      for (let i = 0; i < bufferLength; i++) {
        const x = (i / bufferLength) * testWave.width;
        const y = (dataArray[i] / 255) * testWave.height;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = "green";
      ctx.stroke();
    }
    draw();
  }).catch(e => {
    console.error('마이크 테스트 시작 실패:', e);
    alert('마이크 접근에 실패했습니다. 브라우저 권한을 허용했는지 확인하세요.');
  });
}
function stopMicTest() {
  testWaveDrawing = false;
  if (testStream) testStream.getTracks().forEach(t => t.stop());
  testStream = null;
}

// ====== canvas helpers / display ======
function setCanvasHiDPI(canvas, width, height) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = width + "px";
  canvas.style.height = height + "px";
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function showFullProcessBar() {
  setCanvasHiDPI(fullProcessBar, 800, 70);
  fullProcessBar.style.display = 'block';
  fullProcessTime.style.display = 'none';
}
function hideFullProcessBar() {
  fullProcessBar.style.display = 'none';
  fullProcessTime.style.display = 'none';
}
function drawFullProcessBar(elapsed, total, sample, prepare, record, phase) {
  const canvas = fullProcessBar;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const width = canvas.width / (window.devicePixelRatio || 1);
  const height = canvas.height / (window.devicePixelRatio || 1);
  const sampleW = width * (sample / total);
  const prepareW = width * (prepare / total);
  const recordW = width * (record / total);

  ctx.fillStyle = "#2a9df4";
  ctx.fillRect(1, 28, Math.max(0, sampleW-2), 32);
  ctx.fillStyle = "#3dc463";
  ctx.fillRect(sampleW+1, 28, Math.max(0, prepareW-2), 32);
  ctx.fillStyle = "#2a9df4";
  ctx.fillRect(sampleW+prepareW+1, 28, Math.max(0, recordW-2), 32);

  ctx.strokeStyle = "#111";
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 28, width, 32);

  ctx.font = "bold 22px sans-serif";
  ctx.textAlign = "center";
  ctx.fillStyle = "#111";
  ctx.fillText("샘플", sampleW/2, 24);
  ctx.fillText("준비!", sampleW + prepareW/2, 24);
  ctx.fillText("녹음", sampleW + prepareW + recordW/2, 24);

  const progressX = Math.min(width, Math.max(0, (elapsed/total)*width));
  ctx.beginPath();
  ctx.moveTo(progressX, 22);
  ctx.lineTo(progressX, 62);
  ctx.strokeStyle = "#111";
  ctx.lineWidth = 2;
  ctx.stroke();
}

// sample progress
function updateSampleProgress() {
  const duration = sampleAudio.duration || 0;
  const current = sampleAudio.currentTime || 0;
  sampleProgress.max = duration;
  sampleProgress.value = current;
  sampleTime.innerText = `${formatTime(current)} / ${formatTime(duration)}`;
}
function formatTime(sec) {
  sec = Math.floor(sec);
  const min = String(Math.floor(sec / 60)).padStart(2, '0');
  const s = String(sec % 60).padStart(2, '0');
  return `${min}:${s}`;
}
sampleAudio.ontimeupdate = updateSampleProgress;
sampleAudio.onloadedmetadata = updateSampleProgress;
sampleAudio.onended = updateSampleProgress;

// preload sampleAudioBuffer (decode)
sampleAudio.onloadeddata = async () => {
  try {
    if (!sampleAudio.src) return;
    const response = await fetch(sampleAudio.src);
    const arrayBuffer = await response.arrayBuffer();
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    sampleAudioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
  } catch (e) {
    console.error('샘플 음성 로딩 오류:', e);
  }
};

playSampleBtn.onclick = () => {
  try { sampleAudio.currentTime = 0; } catch (e) {}
  sampleAudio.play();
  updateSampleProgress();
};

// --- Utility: wait for sample metadata ---
function waitForSampleLoaded(timeoutMs = 3000) {
  return new Promise(resolve => {
    if (!sampleAudio.src) return resolve();
    if (!isNaN(sampleAudio.duration) && sampleAudio.duration > 0) return resolve();
    let settled = false;
    function onLoaded() {
      if (settled) return;
      settled = true;
      sampleAudio.removeEventListener('loadedmetadata', onLoaded);
      resolve();
    }
    sampleAudio.addEventListener('loadedmetadata', onLoaded);
    setTimeout(() => {
      if (settled) return;
      settled = true;
      sampleAudio.removeEventListener('loadedmetadata', onLoaded);
      resolve();
    }, timeoutMs);
  });
}

// --- challenge flow (safe) ---
challengeBtn.onclick = async () => {
  playSampleBtn.disabled = true;
  challengeBtn.disabled = true;

  try {
    await waitForSampleLoaded(4000);
    const sampleDuration = Number(sampleAudio.duration) || 0;
    if (!sampleDuration || sampleDuration <= 0 || isNaN(sampleDuration)) {
      alert('샘플이 아직 로드되지 않았습니다. 잠시 후 다시 시도하세요.');
      return;
    }

    const prepareDuration = 1.0;
    const recordDuration = sampleDuration;
    const totalDuration = sampleDuration + prepareDuration + recordDuration;

    showFullProcessBar();
    try { sampleAudio.currentTime = 0; } catch(e){}
    const playPromise = sampleAudio.play();
    if (playPromise && typeof playPromise.then === 'function') {
      try { await playPromise; } catch(e){}
    }

    let startTimestamp = performance.now();
    let phase = "sample";
    let lastPhase = null;
    let recordingStarted = false;
    let rafId = null;

    const loop = (now) => {
      try {
        let elapsed = (now - startTimestamp) / 1000;
        if (elapsed <= sampleDuration) phase = "sample";
        else if (elapsed <= sampleDuration + prepareDuration) phase = "prepare";
        else if (elapsed <= totalDuration) phase = "record";
        else phase = "done";

        drawFullProcessBar(elapsed, totalDuration, sampleDuration, prepareDuration, recordDuration, phase);

        if (phase !== lastPhase) {
          lastPhase = phase;
          if (phase === "prepare") {
            try { sampleAudio.pause(); } catch(e){}
          }
          if (phase === "record" && !recordingStarted) {
            recordingStarted = true;
            startRecordingWithTimeout(recordDuration);
          }
        }

        if (phase !== "done") rafId = requestAnimationFrame(loop);
        else {
          hideFullProcessBar();
          playSampleBtn.disabled = false;
          challengeBtn.disabled = false;
        }
      } catch (e) {
        console.error('processLoop error:', e);
        if (rafId) cancelAnimationFrame(rafId);
        hideFullProcessBar();
        playSampleBtn.disabled = false;
        challengeBtn.disabled = false;
      }
    };

    rafId = requestAnimationFrame(loop);

  } catch (e) {
    console.error('challenge flow error:', e);
    alert('도전 시작 중 오류가 발생했습니다. 콘솔을 확인해주세요.');
  } finally {
    playSampleBtn.disabled = false;
    challengeBtn.disabled = false;
  }
};

// --- recording ---
async function startRecordingWithTimeout(duration) {
  audioChunks = [];
  let stream = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (e) {
    console.error('마이크 접근 실패:', e);
    alert('마이크 접근에 실패했습니다. 권한을 확인하세요.');
    return;
  }

  try {
    mediaRecorder = new MediaRecorder(stream);
  } catch (e) {
    console.error('MediaRecorder 생성 실패:', e);
    alert('브라우저가 MediaRecorder를 지원하지 않거나, 형식 문제로 실패했습니다.');
    stream.getTracks().forEach(t => t.stop());
    return;
  }

  mediaRecorder.start();
  showLiveWave(stream);

  mediaRecorder.ondataavailable = (e) => { audioChunks.push(e.data); };

  setTimeout(() => {
    if (mediaRecorder && mediaRecorder.state === "recording") mediaRecorder.stop();
  }, duration * 1000);

  mediaRecorder.onstop = async () => {
    hideLiveWave();
    try { if (stream) stream.getTracks().forEach(t => t.stop()); } catch(e){}
    const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
    userAudio.src = URL.createObjectURL(audioBlob);
    userAudio.load();

    try {
      const arrayBuffer = await audioBlob.arrayBuffer();
      const audioCtx2 = new (window.AudioContext || window.webkitAudioContext)();
      userAudioBuffer = await audioCtx2.decodeAudioData(arrayBuffer);
    } catch (e) {
      console.error('사용자 녹음 디코드 실패:', e);
    }

    showResultScreen();
  };
}

// live wave
function showLiveWave(stream) {
  liveWave.classList.remove('hidden');
  const ctx = liveWave.getContext('2d');
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const analyser = audioCtx.createAnalyser();
  const source = audioCtx.createMediaStreamSource(stream);
  source.connect(analyser);

  analyser.fftSize = 2048;
  const bufferLength = analyser.fftSize;
  const dataArray = new Uint8Array(bufferLength);
  liveWaveDrawing = true;

  function draw() {
    if (!liveWaveDrawing) return;
    requestAnimationFrame(draw);
    analyser.getByteTimeDomainData(dataArray);
    ctx.clearRect(0, 0, liveWave.width, liveWave.height);
    ctx.beginPath();
    for (let i = 0; i < bufferLength; i++) {
      const x = (i / bufferLength) * liveWave.width;
      const y = (dataArray[i] / 255) * liveWave.height;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = "green";
    ctx.stroke();
  }
  draw();
}
function hideLiveWave() { liveWaveDrawing = false; liveWave.classList.add('hidden'); }

// ===== scoring helpers =====

// compute volume chunks from AudioBuffer
function getVolumeChunks(audioBuffer, chunkSizeParam = chunkSize) {
  if (!audioBuffer) return [];
  const data = audioBuffer.getChannelData(0);
  const chunkCount = Math.floor(data.length / chunkSizeParam);
  const vols = [];
  for (let i = 0; i < chunkCount; i++) {
    let vol = 0;
    for (let j = 0; j < chunkSizeParam; j++) vol += Math.abs(data[i * chunkSizeParam + j]);
    vol /= chunkSizeParam;
    vols.push(vol);
  }
  return vols;
}

// normalize an array (zero mean, unit variance)
function normalizeArray(arr) {
  const n = arr.length;
  if (n === 0) return [];
  let mean = 0;
  for (let i = 0; i < n; i++) mean += arr[i];
  mean /= n;
  let varSum = 0;
  for (let i = 0; i < n; i++) {
    const d = arr[i] - mean;
    varSum += d * d;
  }
  const std = Math.sqrt(varSum / n) || 1;
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = (arr[i] - mean) / std;
  return out;
}

// normalized cross-correlation at lag (positive lag means user delayed)
function crossCorrelationAtLag(a, b, lag) {
  const startA = Math.max(0, -lag);
  const startB = Math.max(0, lag);
  const n = Math.min(a.length - startA, b.length - startB);
  if (n <= 0) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += a[startA + i] * b[startB + i];
  return sum / n;
}

// find best lag within +/- maxLagChunks
function findBestLagCorrelation(sampleVols, userVols, maxLagChunks = 20) {
  if (!sampleVols || !userVols || sampleVols.length === 0 || userVols.length === 0) {
    return { bestCorr: 0, bestLag: 0 };
  }
  const a = normalizeArray(sampleVols);
  const b = normalizeArray(userVols);
  let bestCorr = -Infinity;
  let bestLag = 0;
  for (let lag = -maxLagChunks; lag <= maxLagChunks; lag++) {
    const corr = crossCorrelationAtLag(a, b, lag);
    if (corr > bestCorr) { bestCorr = corr; bestLag = lag; }
  }
  if (!isFinite(bestCorr)) bestCorr = 0;
  bestCorr = Math.max(-1, Math.min(1, bestCorr));
  return { bestCorr, bestLag };
}

// map corr to 0..100 score
function corrToScore(corr) {
  const positive = Math.max(0, corr);
  const score = Math.round(Math.min(100, (positive / 0.75) * 100));
  return score;
}

const DEFAULT_MAX_LAG_CHUNKS = 20;

function computeScoreWithAlignment(sampleVols, userVols) {
  if (!sampleVols.length || !userVols.length) return { score: 0, bestCorr:0, bestLag:0 };

  function smooth(arr) {
    if (arr.length < 3) return arr.slice();
    const out = new Array(arr.length);
    out[0] = arr[0];
    for (let i = 1; i < arr.length - 1; i++) out[i] = (arr[i - 1] + arr[i] + arr[i + 1]) / 3;
    out[arr.length - 1] = arr[arr.length - 1];
    return out;
  }

  const sSm = smooth(sampleVols);
  const uSm = smooth(userVols);

  const { bestCorr, bestLag } = findBestLagCorrelation(sSm, uSm, DEFAULT_MAX_LAG_CHUNKS);
  const lagPenalty = Math.max(0, Math.abs(bestLag) - 2) * 0.01;
  const adjustedCorr = Math.max(0, bestCorr - lagPenalty);
  const score = corrToScore(adjustedCorr);
  return { score, bestCorr, bestLag };
}

// ====== result / scoring UI ======
function showResultScreen() {
  resultSection.classList.remove('hidden');
  setCanvasHiDPI(overlapWave, canvasLogicalWidth, canvasLogicalHeight);

  const sampleVols = getVolumeChunks(sampleAudioBuffer, chunkSize);
  const userVols = getVolumeChunks(userAudioBuffer, chunkSize);

  // compute score with alignment
  const { score, bestCorr, bestLag } = computeScoreWithAlignment(sampleVols, userVols);

  let rouletteInterval = null;
  function startScoreRoulette() {
    rouletteInterval = setInterval(() => {
      scoreResult.innerText = `점수: ${Math.floor(Math.random() * 101)}점`;
    }, 40);
  }
  function stopScoreRoulette() {
    clearInterval(rouletteInterval);
    scoreResult.innerText = `점수: ${score}점`;

    // save best (max) score
    if (currentStageKey) {
      try {
        const prev = getStoredScore(currentStageKey);
        const toStore = (prev === null) ? score : Math.max(prev, score);
        localStorage.setItem('score_' + currentStageKey, String(toStore));
      } catch (e) {
        console.warn('로컬스토리지 저장 실패:', e);
      }
      updateStageButtonVisual(currentStageKey);
      updateCurrentStageBestScore(currentStageKey);
    }

    // debug info (optional): log alignment details
    console.debug('Scoring alignment', { bestCorr, bestLag, score });
  }

  startScoreRoulette();

  userAudio.currentTime = 0;
  userAudio.play();
  animateBarGraph(sampleVols, userVols, overlapWave, userAudio, stopScoreRoulette);
  userAudio.onloadedmetadata = () => {
    userProgress.max = userAudio.duration || 0;
    userProgress.value = 0;
    userTime.innerText = `${formatTime(userAudio.duration)}`;
  };
}

// animate bar graph
function animateBarGraph(sampleVols, userVols, canvas, audioElem, onEnd) {
  const ctx = canvas.getContext('2d');
  const width = canvasLogicalWidth;
  const height = canvasLogicalHeight;
  const chunkCount = Math.min(sampleVols.length, userVols.length);
  const groupCount = Math.ceil(chunkCount / barGroup) || 1;
  const barWidth = width / groupCount;
  const scaleY = height * 0.9;

  const maxSample = Math.max(...sampleVols, 0.01);
  const maxUser = Math.max(...userVols, 0.01);
  const globalMax = Math.max(maxSample, maxUser, 0.01);

  function draw() {
    const curChunk = Math.floor((audioElem.currentTime / (audioElem.duration || 1)) * chunkCount);
    const curGroup = Math.floor(curChunk / barGroup);
    ctx.clearRect(0, 0, width, height);

    for (let i = 0; i < groupCount; i++) {
      let sSum = 0, count = 0;
      for (let j = 0; j < barGroup && i * barGroup + j < chunkCount; j++) {
        sSum += sampleVols[i * barGroup + j];
        count++;
      }
      const sAvg = count ? sSum / count : 0;
      const sNorm = sAvg / globalMax;
      let h = sNorm * scaleY;
      h = Math.min(h, height - 1);
      ctx.fillStyle = "rgb(32,90,210)";
      ctx.fillRect(i * barWidth, height - h, barWidth * 0.7, h);
    }

    for (let i = 0; i <= curGroup; i++) {
      let uSum = 0, count = 0;
      for (let j = 0; j < barGroup && i * barGroup + j < chunkCount; j++) {
        uSum += userVols[i * barGroup + j];
        count++;
      }
      const uAvg = count ? uSum / count : 0;
      const uNorm = uAvg / globalMax;
      let h = uNorm * scaleY;
      h = Math.min(h, height - 1);
      ctx.fillStyle = "rgb(210,32,32)";
      ctx.fillRect(i * barWidth + barWidth * 0.15, height - h, barWidth * 0.7, h);
    }

    if (!audioElem.paused && !audioElem.ended) {
      requestAnimationFrame(draw);
      userProgress.max = audioElem.duration || 0;
      userProgress.value = audioElem.currentTime || 0;
      userTime.innerText = `${formatTime(audioElem.currentTime)} / ${formatTime(audioElem.duration)}`;
    } else {
      if (typeof onEnd === "function") onEnd();
    }
  }
  draw();
}
