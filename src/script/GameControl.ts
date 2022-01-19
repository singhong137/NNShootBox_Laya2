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
import { Label } from "laya/ui/Label";
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

    private shooter: Sprite;

    private flag_first: boolean = true;

    private inputImgs: Sprite[];
    private hiddenImgs: Sprite[];
    private outputImg: Sprite;

    private inputLabels: Label[];
    private hiddenLabels: Label[];
    private outputLabel: Label;

    public boxes: Sprite[];

    private nn: NeuralNetwork;

    private ax: number=0; // shooter加速度


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

            // console.log(
            //     'inputs : ',
            //     this.nn.inputs.data, '\n',
            //     'hidden : ',
            //     this.nn.hidden.data,
            //     'weight0 : ',
            //     this.nn.weights0,
            //     'weight1 : ',
            //     this.nn.weights1,
            //     'bias0 : ',
            //     this.nn.bias0,
            //     'bias1 : ',
            //     this.nn.bias1
            // );
            console.log('inputs : ');
            console.table(this.nn.inputs.data);
            console.log('hidden : ');
            console.table(this.nn.hidden.data);
            console.log('weight0 : ');
            console.table(this.nn.weights0.data);
            console.log('weight1 : ');
            console.table(this.nn.weights1.data);
            console.log('bias0 : ');
            console.table(this.nn.bias0.data);
            console.log('bias1 : ');
            console.table(this.nn.bias1.data);
        }

        // test output
        console.log("0, 0 = " + this.nn.feedForward([0, 0]).data);
        console.log("0, 1 = " + this.nn.feedForward([0, 1]).data);
        console.log("1, 0 = " + this.nn.feedForward([1, 0]).data);
        console.log("1, 1 = " + this.nn.feedForward([1, 1]).data);

        // nn for shoot !
        console.log('nn for shoot !');
        this.nn = new NeuralNetwork(NUM_INPUTS, NUM_HIDDEN, NUM_OUTPUTS);

        // for (let i = 0; i < NUM_SAMPLES; i++) {

        // }

        console.log("0, 0 = " + this.nn.feedForward([0, 0]).data);
        console.log("0, 1 = " + this.nn.feedForward([0, 1]).data);
        console.log("1, 0 = " + this.nn.feedForward([1, 0]).data);
        console.log("1, 1 = " + this.nn.feedForward([1, 1]).data);
    }

    onEnable(): void {
        console.log('=========');

        this._time = Date.now();
        this._gameBox = this.owner.getChildByName("gameBox") as Sprite;

        this.shooter = this.owner.getChildByName('shooter') as Sprite;

        if (this.flag_first) {
            let i0 = this.owner.getChildByName('i0') as Sprite;
            let i1 = this.owner.getChildByName('i1') as Sprite;
            let h0 = this.owner.getChildByName('h0') as Sprite;
            let h1 = this.owner.getChildByName('h1') as Sprite;
            let h2 = this.owner.getChildByName('h2') as Sprite;
            let h3 = this.owner.getChildByName('h3') as Sprite;
            let h4 = this.owner.getChildByName('h4') as Sprite;
            let o0 = this.owner.getChildByName('o0') as Sprite;

            this.inputImgs = [i0, i1];
            this.hiddenImgs = [h0, h1, h2, h3, h4];
            this.outputImg = o0 as Sprite;
            i0.x = i1.x -= 600;
            h0.x = h1.x = h2.x = h3.x = h4.x -= 600;
            o0.x -= 600;
            i0.pivotX = i1.pivotX = h0.pivotX = h1.pivotX = h2.pivotX = h3.pivotX = h4.pivotX = o0.pivotX = i0.width / 2;
            i0.pivotY = i1.pivotY = h0.pivotY = h1.pivotY = h2.pivotY = h3.pivotY = h4.pivotY = o0.pivotY = i0.width / 2;

            this.inputLabels = [];
            this.hiddenLabels = [];
            this.outputLabel = new Label('0.000');

            let d = Laya.stage.graphics;
            for (let i = 0; i < this.inputImgs.length; i++) {
                let lb = new Label('0.000');
                lb.fontSize = 20;
                lb.pos(this.inputImgs[i].x - 26, this.inputImgs[i].y - 8);
                Laya.stage.addChild(lb);
                this.inputLabels.push(lb);

                for (let j = 0; j < this.hiddenImgs.length; j++) {
                    d.drawLine(this.inputImgs[i].x, this.inputImgs[i].y, this.hiddenImgs[j].x, this.hiddenImgs[j].y, 'ff0000', 2);

                    if (i == 0) {
                        d.drawLine(this.hiddenImgs[j].x, this.hiddenImgs[j].y, this.outputImg.x, this.outputImg.y, 'ff0000', 2);

                        lb = new Label('0.000');
                        lb.fontSize = 20;
                        lb.pos(this.hiddenImgs[j].x - 26, this.hiddenImgs[j].y - 8);
                        Laya.stage.addChild(lb);
                        this.hiddenLabels.push(lb);
                    }

                }
            }

            this.outputLabel.fontSize = 20;
            this.outputLabel.pos(this.outputImg.x - 26, this.outputImg.y - 8);
            Laya.stage.addChild(this.outputLabel);

            console.log(this.inputLabels.length, ' // ', this.hiddenLabels.length);

            this.flag_first = false;
        }

    }

    onUpdate(): void {
        if (this._started) {
            //每间隔一段时间创建一个盒子
            let now = Date.now();
            if (now - this._time > this.createBoxInterval) {
                this._time = now;
                this.createBox();
            }

            if (this.boxes) {
                let max_y_idx = 0;
                let temp_y = Number.MIN_VALUE;
                this.boxes.forEach((i, j) => {
                    i.getComponent(Script).normalRoll();
                    if (i.y > temp_y) {
                        max_y_idx = j;
                        temp_y = i.y;
                    }
                });

                if (this.boxes[max_y_idx]) this.boxes[max_y_idx].getComponent(Script).fasterRoll();
            }
            this.shooter.x = Laya.stage.mouseX - this.shooter.width / 2;

            this.onStageClick(new Event());
        }

    }



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
        // flyer.pos(Laya.stage.mouseX - 15, Laya.stage.mouseY); // 15 is bullet image width / 2 ;
        flyer.pos(Laya.stage.mouseX - 15, this.shooter.y);
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