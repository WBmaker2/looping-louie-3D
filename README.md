# Looping Louie 3D

원본(jvibeschool.org/3D/Looping) 스타일의 3D 웹 게임. Blender MCP로 제작.

## 실행
```
python3 -m http.server 8000
```
브라우저에서 http://localhost:8000 접속 (WebGL 지원 필요)

## 조작
- 1인: Space / 화면 큰 버튼
- 2인: 왼쪽 Shift + 오른쪽 Shift
- 3인: 왼쪽 Shift + Space + 오른쪽 Shift
- P 일시정지, R 다시시작

## 에셋 (CC0, Quaternius via Poly Pizza)
- Chicken https://poly.pizza/m/Z3RCoCYss4
- Farmer, Farm, Tree, Spaceship — 모두 CC0

## 구조
- index.html, style.css, src/main.js (Three.js), src/physics.js (120Hz 물리), src/player-mode.js
