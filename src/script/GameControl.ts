const NUM_INPUTS: number = 2;
const NUM_HIDDEN: number = 5;
const NUM_OUTPUTS: number = 1;
const NUM_SAMPLES: number = 10000;

import DropBox from "./DropBox";
import Bullet from "./Bullet";
import { Script } from "laya/components/Script";
import { Prefab } from "laya/components/Prefab";
import { Sprite } from "laya/display/Sprite";
import { Pool } from "laya/utils/Pool";
import { Laya } from "Laya";
import { Event } from "laya/events/Event";
import { NeuralNetwork } from "./NeuralNetwork";
import { Matrix } from "./Matrix";
/**
 * 游戏控制脚本。定义了几个dropBox，bullet，createBoxInterval等变量，能够在IDE显示及设置该变量
 * 更多类型定义，请参考官方文档
 */
export default class GameControl extends Script {
    /** @prop {name:dropBox,tips:"掉落容器预制体对象",type:Prefab}*/
    dropBox: Prefab;
    /** @prop {name:bullet,tips:"子弹预制体对象",type:Prefab}*/
    bullet: Prefab;
    /** @prop {name:createBoxInterval,tips:"间隔多少毫秒创建一个下跌的容器",type:int,default:1000}*/
    createBoxInterval: number = 1000;
    /**开始时间*/
    private _time: number = 0;
    /**是否已经开始游戏 */
    private _started: boolean = false;
    /**子弹和盒子所在的容器对象 */
    private _gameBox: Sprite;

    private nn: NeuralNetwork;

    constructor() {
        super();

        let m0 = new Matrix(2, 3, [
            [2, 1, -1],
            [4, 3, 0]
        ]);
        let m1 = new Matrix(2, 3, [
            [0, 1, -1],
            [2, -3, 0]
        ]);
        let m2 = new Matrix(2, 2, [
            [1, -1],
            [3, 0]
        ]);
        console.table(m1.data);
        console.table(Matrix.transpose(m1).data);

        console.log('-----------test nn-----------');

        this.nn = new NeuralNetwork(NUM_INPUTS, NUM_HIDDEN, NUM_OUTPUTS);
        for (let i = 0; i < NUM_SAMPLES; i++) {
            // TEST XOR gate logic
            // 0 0 = 0
            // 0 1 = 1
            // 1 0 = 1
            // 1 1 = 0

            let input0 = Math.round(Math.random()); // 0 or 1
            let input1 = Math.round(Math.random()); // 0 or 1
            let output = input0 == input1 ? 0 : 1;
            this.nn.train([input0, input1], [output]);
        }

        // test output
        console.log("0, 0 = " + this.nn.feedForward([0, 0]).data);
        console.log("0, 1 = " + this.nn.feedForward([0, 1]).data);
        console.log("1, 0 = " + this.nn.feedForward([1, 0]).data);
        console.log("1, 1 = " + this.nn.feedForward([1, 1]).data);
    }

    onEnable(): void {
        this._time = Date.now();
        this._gameBox = this.owner.getChildByName("gameBox") as Sprite;
    }

    onUpdate(): void {
        //每间隔一段时间创建一个盒子
        let now = Date.now();
        if (now - this._time > this.createBoxInterval && this._started) {
            this._time = now;
            this.createBox();
        }

        if (this.boxes) {
            this.boxes.forEach((i, j) => {
                this.boxes[j].getComponent(Script).normalRoll();
                this.boxes[0].getComponent(Script).onFastest = false;
            });

            this.boxes.sort((a, b) => { return b.y - a.y });
            if (this.boxes[0]) {
                this.boxes[0].getComponent(Script).onFastest = true;
                this.boxes[0].getComponent(Script).fasterRoll();
            }
        }
    }

    public boxes: Sprite[];

    createBox(): void {
        //使用对象池创建盒子
        let box: Sprite = Pool.getItemByCreateFun("dropBox", this.dropBox.create, this.dropBox);
        box.pos(Math.random() * (Laya.stage.width - 100), -100);
        this._gameBox.addChild(box);

        this.boxes.push(box);
    }

    onStageClick(e: Event): void {
        //停止事件冒泡，提高性能，当然也可以不要
        e.stopPropagation();
        //舞台被点击后，使用对象池创建子弹
        let flyer: Sprite = Pool.getItemByCreateFun("bullet", this.bullet.create, this.bullet);
        flyer.pos(Laya.stage.mouseX, Laya.stage.mouseY);
        this._gameBox.addChild(flyer);
    }

    /**开始游戏，通过激活本脚本方式开始游戏*/
    startGame(): void {
        if (!this._started) {
            this._started = true;
            this.enabled = true;
        }
        this.boxes = [];
    }

    /**结束游戏，通过非激活本脚本停止游戏 */
    stopGame(): void {
        this._started = false;
        this.enabled = false;
        this.createBoxInterval = 1000;
        this._gameBox.removeChildren();
    }
}