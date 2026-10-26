import './style.css';
import {Game} from './game/Game';
const app=document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML='<div id="viewport"></div><div id="hud"></div>';
new Game(document.querySelector('#viewport')!,document.querySelector('#hud')!);
