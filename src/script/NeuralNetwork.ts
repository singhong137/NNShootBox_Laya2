import { Matrix } from "./Matrix";

const LOG_ON = true; // whether or not to show error logging
const LOG_FREQ = 20000; // how often to show error logs (in iterations)

export class NeuralNetwork {
    private _inputs: Matrix;
    private _hidden: Matrix;

    private _numInputs: number;
    private _numHidden: number;
    private _numOutputs: number;

    private _bias0: Matrix;
    private _bias1: Matrix;
    private _weights0: Matrix;
    private _weights1: Matrix;

    private _logCount: number;

    constructor(numInputs: number, numHidden: number, numOutputs: number) {
        // this._inputs=[];
        // this._hidden=[];
        this._numInputs = numInputs;
        this._numHidden = numHidden;
        this._numOutputs = numOutputs;
        this._bias0 = new Matrix(1, this._numHidden);
        this._bias1 = new Matrix(1, this._numOutputs);
        this._weights0 = new Matrix(this._numInputs, this._numHidden);
        this._weights1 = new Matrix(this._numHidden, this._numOutputs);

        // error logging
        this._logCount = LOG_FREQ;

        // randomise the initial weights
        this._bias0.randomWeights();
        this._bias1.randomWeights();
        this._weights0.randomWeights();
        this._weights1.randomWeights();
    }

    get inputs(): Matrix { return this._inputs; }
    set inputs(inputs: Matrix) { this._inputs = inputs; }

    get hidden(): Matrix { return this._hidden; }
    set hidden(hidden: Matrix) { this._hidden = hidden; }

    get bias0(): Matrix { return this._bias0; }
    set bias0(bias: Matrix) { this._bias0 = bias; }

    get bias1(): Matrix { return this._bias1; }
    set bias1(bias: Matrix) { this._bias1 = bias; }

    get weights0(): Matrix { return this._weights0; }
    set weights0(weights: Matrix) { this._weights0 = weights; }

    get weights1(): Matrix { return this._weights1; }
    set weights1(weights: Matrix) { this._weights1 = weights; }

    get logCount(): number { return this._logCount; }
    set logCount(count: number) { this._logCount = count; }

    public feedForward(inputArray: number[]): Matrix {
        // convert input array to a matrix
        this.inputs = Matrix.convertFromArray(inputArray);

        // find the hidden values and apply the activation function
        this.hidden = Matrix.dot(this.inputs, this.weights0);
        this.hidden = Matrix.add(this.hidden, this.bias0); // apply bias
        this.hidden = Matrix.map(this.hidden, (x: number) => sigmoid(x));

        // find the output values and apply the activation function
        let outputs = Matrix.dot(this.hidden, this.weights1);
        outputs = Matrix.add(outputs, this.bias1); // apply bias
        outputs = Matrix.map(outputs, (x: number) => sigmoid(x));

        return outputs;
    }

    public train(inputArray: number[], targetArray: number[]) {
        // feed the input data through the network
        let outputs = this.feedForward(inputArray);

        // calculate the output errors (target - output)
        let targets = Matrix.convertFromArray(targetArray);
        let outputErrors = Matrix.subtract(targets, outputs);

        // error logging
        if (LOG_ON) {
            if (this.logCount == LOG_FREQ) console.log('error = ' + outputErrors.data[0][0]);
            this.logCount--;
            if (this.logCount == 0) this.logCount = LOG_FREQ;
        }

        // calculate the deltas (errors * derivitive of the output)
        let outputDerivs = Matrix.map(outputs, (x: number) => sigmoid(x, true));
        let outputDeltas = Matrix.multiply(outputErrors, outputDerivs);

        // calculate hidden layer errors (deltas "dot" transpose of weights1)
        let weights1T = Matrix.transpose(this.weights1);
        let hiddenErrors = Matrix.dot(outputDeltas, weights1T);

        // calculate the hidden deltas (errors * derivitive of hidden)
        let hiddenDerivs = Matrix.map(this.hidden, (x: number) => sigmoid(x, true));
        let hiddenDeltas = Matrix.multiply(hiddenErrors, hiddenDerivs);

        // update the weights (add transpose of layers "dot" deltas)
        let hiddenT = Matrix.transpose(this.hidden);
        this.weights1 = Matrix.add(this.weights1, Matrix.dot(hiddenT, outputDeltas));
        let inputsT = Matrix.transpose(this.inputs);
        this.weights0 = Matrix.add(this.weights0, Matrix.dot(inputsT, hiddenDeltas));

        // update bias
        this.bias1 = Matrix.add(this.bias1, outputDeltas);
        this.bias0 = Matrix.add(this.bias0, hiddenDeltas);
    }
}

function sigmoid(x: number, deriv: boolean = false) {
    if (deriv) return x * (1 - x);
    return 1 / (1 + Math.exp(-x));
}