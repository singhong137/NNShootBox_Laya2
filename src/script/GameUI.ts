import { ui } from "./../ui/layaMaxUI";
import GameControl from "./GameControl"
import { MouseManager } from "laya/events/MouseManager";
import { Event } from "laya/events/Event";
import { Handler } from "laya/utils/Handler";
/**
 * 本示例采用非脚本的方式实现，而使用继承页面基类，实现页面逻辑。在IDE里面设置场景的Runtime属性即可和场景进行关联
 * 相比脚本方式，继承式页面类，可以直接使用页面定义的属性（通过IDE内var属性定义），比如this.tipLbll，this.scoreLbl，具有代码提示效果
 * 建议：如果是页面级的逻辑，需要频繁访问页面内多个元素，使用继承式写法，如果是独立小模块，功能单一，建议用脚本方式实现，比如子弹脚本。
 */
export default class GameUI extends ui.test.TestSceneUI {
    /**设置单例的引用方式，方便其他类引用 */
    static instance: GameUI;
    /**当前游戏积分字段 */
    private _score: number;
    /**游戏控制脚本引用，避免每次获取组件带来不必要的性能开销 */
    public control: GameControl;

    constructor() {
        super();
        GameUI.instance = this;
        //关闭多点触控，否则就无敌了
        MouseManager.multiTouchEnabled = false;
    }

    onEnable(): void {
        this.control = this.getComponent(GameControl);
        //点击提示文字，开始游戏
        this.tipLbll.on(Event.CLICK, this, this.onTipClick);
        this.rd_train.selectHandler = new Handler(this, this.onSelectTrainCount);
    }

    onSelectTrainCount(i: number) {
        // console.log("onSelectTrainCount : ", i);
        let n = 0;
        if (i == 0) n = 1;
        if (i == 1) n = 10;
        if (i == 2) n = 100;
        this.control.setTrainCount(n);
    }

    private _trainTime = 60;
    onTipClick(e: Event): void {
        // this.tipLbll.visible = false;
        this.tipLbll.bgColor = '';
        this._score = 0;
        this.scoreLbl.text = "";
        this.control.startGame();
        this.rd_train.visible = false;

        this.tipLbll.text = '神经网络训练中：' + this._trainTime.toString();
        this.timer.loop(1000, this, () => {
            this._trainTime--;
            if (this._trainTime > 0) {
                this.tipLbll.text = '神经网络训练中：' + this._trainTime.toString();
            } else if (this._trainTime < 0) {
                this.tipLbll.text = '神经网络开始玩游戏';
                this.control.nn_go = true;
                this.timer.clearAll(this);
                return;
            }
        });
    }

    /**增加分数 */
    addScore(value: number = 1): void {
        this._score += value;
        this.scoreLbl.changeText("分数：" + this._score);
        //随着分数越高，难度增大
        if (this.control.createBoxInterval > 600 && this._score % 20 == 0) this.control.createBoxInterval -= 20;
    }

    /**停止游戏 */
    stopGame(): void {
        this.tipLbll.visible = true;
        this.tipLbll.text = "游戏结束了，点击这里重新开始";
        this.control.stopGame();
        this.rd_train.visible = true;
    }
}