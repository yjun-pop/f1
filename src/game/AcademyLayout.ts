// Fictional academy campus. Not part of the eight championship circuits.
const points:number[][]=[[0,60],[0,300],[0,600]],sections:{number:number;name:string;coordinate:number[];braking:boolean}[]=[];
function arc(cx:number,cz:number,r:number,from:number,to:number,name:string){
 const count=Math.ceil(Math.abs(to-from)/(Math.PI/16)),middle=(from+to)/2;
 sections.push({number:sections.length+1,name,coordinate:[(cx+r*Math.cos(middle))/111320,-(cz+r*Math.sin(middle))/111320],braking:true});
 for(let i=1;i<=count;i++){const a=from+(to-from)*i/count;points.push([cx+r*Math.cos(a),cz+r*Math.sin(a)]);}
}
arc(80,600,80,Math.PI,Math.PI/2,'단일 코너');points.push([300,680]);arc(300,600,80,Math.PI/2,0,'진입 제동');
points.push([380,520]);arc(440,520,60,Math.PI,Math.PI*1.5,'S자 진입');arc(440,400,60,Math.PI/2,0,'S자 탈출');
points.push([500,240]);arc(420,240,80,0,-Math.PI,'헤어핀');points.push([340,350]);arc(280,350,60,0,Math.PI/2,'연결 코너');
points.push([200,410]);arc(200,350,60,Math.PI/2,Math.PI,'출구 정렬');points.push([140,60]);arc(70,60,70,0,-Math.PI,'마지막 코너');points.pop();
export const ASSESSMENT_POINTS:readonly number[][]=points;
export const ASSESSMENT_SECTIONS=sections;
export const ACADEMY_ASSESSMENT={course:'academy-v2' as const,label:'아카데미 기술 코스',referenceLap:100,cornerCount:8,length:Math.round(points.reduce((n,p,i)=>{const q=points[(i+1)%points.length];return n+Math.hypot(q[0]-p[0],q[1]-p[1]);},0))};
