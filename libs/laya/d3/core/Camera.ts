import { Config3D } from "../../../Config3D";
import { Laya } from "../../../Laya";
import { Node } from "../../display/Node";
import { Event } from "../../events/Event";
import { LayaGL } from "../../layagl/LayaGL";
import { FilterMode } from "../../resource/FilterMode";
import { RenderTextureDepthFormat, RenderTextureFormat, RTDEPTHATTACHMODE } from "../../resource/RenderTextureFormat";
import { SystemUtils } from "../../webgl/SystemUtils";
import { WebGLContext } from "../../webgl/WebGLContext";
import { PostProcess } from "../component/PostProcess";
import { Cluster } from "../graphics/renderPath/Cluster";
import { BoundFrustum } from "../math/BoundFrustum";
import { Matrix4x4 } from "../math/Matrix4x4";
import { Ray } from "../math/Ray";
import { Vector2 } from "../math/Vector2";
import { Vector3 } from "../math/Vector3";
import { Vector4 } from "../math/Vector4";
import { Viewport } from "../math/Viewport";
import { RenderTexture } from "../resource/RenderTexture";
import { ShaderData } from "../shader/ShaderData";
import { Picker } from "../utils/Picker";
import { BaseCamera } from "./BaseCamera";
import { DirectionLight } from "./light/DirectionLight";
import { ShadowMode } from "./light/ShadowMode";
import { BlitScreenQuadCMD } from "./render/command/BlitScreenQuadCMD";
import { CommandBuffer } from "./render/command/CommandBuffer";
import { RenderContext3D } from "./render/RenderContext3D";
import { Scene3D } from "./scene/Scene3D";
import { Scene3DShaderDeclaration } from "./scene/Scene3DShaderDeclaration";
import { Transform3D } from "./Transform3D";
import { ILaya3D } from "../../../ILaya3D";
import { ShadowUtils } from "./light/ShadowUtils";
import { SpotLight } from "./light/SpotLight";
import { DepthPass, DepthTextureMode } from "../depthMap/DepthPass";
import { PerformancePlugin } from "../../utils/Performance";
import { Shader3D } from "../shader/Shader3D";
import { BaseTexture } from "laya/resource/BaseTexture";
import { MulSampleRenderTexture } from "../resource/MulSampleRenderTexture";

/**
 * ?????????????????????
 */
export enum CameraClearFlags {
	/**???????????????*/
	SolidColor = 0,
	/**?????????*/
	Sky = 1,
	/**????????????*/
	DepthOnly = 2,
	/**????????????*/
	Nothing = 3
}

/**
 * ??????????????????
 */
export enum CameraEventFlags {
	//BeforeDepthTexture,
	//AfterDepthTexture,
	//BeforeDepthNormalsTexture,
	//AfterDepthNormalTexture,
	/**?????????????????????????????????*/
	BeforeForwardOpaque = 0,
	/**???????????????????????????*/
	BeforeSkyBox = 2,
	/**??????????????????????????????*/
	BeforeTransparent = 4,
	/**????????????????????????*/
	BeforeImageEffect = 6,
	/**?????????????????????*/
	AfterEveryThing = 8,
}

/**
 * <code>Camera</code> ???????????????????????????
 */
export class Camera extends BaseCamera {
	/** @internal */
	static _tempVector20: Vector2 = new Vector2();

	/** @internal */
	static __updateMark: number = 0;
	static set _updateMark(value: number) {
		Camera.__updateMark = value;
	}

	static get _updateMark(): number {
		return Camera.__updateMark;
	}
	/** @internal ??????????????????*/
	static depthPass: DepthPass = new DepthPass();

	/**
	 * ???????????????scene????????????scene??????????????????????????????
	 * @param camera ??????
	 * @param scene ?????????????????????
	 * @param shader ?????????
	 * @param replacementTag ???????????????
	 */
	static drawRenderTextureByScene(camera: Camera, scene: Scene3D, renderTexture: RenderTexture, shader: Shader3D = null, replaceFlag: string = null): RenderTexture {
		if (!renderTexture) return null;
		let recoverTexture = camera.renderTarget;
		camera.renderTarget = renderTexture;


		var viewport: Viewport = camera.viewport;
		var needInternalRT: boolean = camera._needInternalRenderTexture();
		var context: RenderContext3D = RenderContext3D._instance;
		var scene: Scene3D = context.scene = scene
		context.pipelineMode = context.configPipeLineMode;
		context.replaceTag = replaceFlag;
		context.customShader = shader;

		if (needInternalRT) {
			camera._internalRenderTexture = RenderTexture.createFromPool(viewport.width, viewport.height, camera._getRenderTextureFormat(), camera.depthTextureFormat);
			camera._internalRenderTexture.filterMode = FilterMode.Bilinear;
		}
		else {
			camera._internalRenderTexture = null;
		}
		var needShadowCasterPass: boolean = camera._renderShadowMap(scene, context);
		camera._preRenderMainPass(context, scene, needInternalRT, viewport);
		camera._renderMainPass(context, viewport, scene, shader, replaceFlag, needInternalRT);
		camera._aftRenderMainPass(needShadowCasterPass);
		camera.renderTarget = recoverTexture;
		return camera.renderTarget;
	}


	/** @internal */
	protected _aspectRatio: number;
	/** @internal */
	protected _viewport: Viewport;
	/** @internal */
	protected _rayViewport: Viewport;
	/** @internal */
	protected _normalizedViewport: Viewport;
	/** @internal */
	protected _viewMatrix: Matrix4x4;
	/** @internal */
	protected _projectionMatrix: Matrix4x4;
	/** @internal */
	protected _projectionViewMatrix: Matrix4x4;
	/** @internal */
	protected _boundFrustum: BoundFrustum;
	/** @internal */
	private _updateViewMatrix: boolean = true;
	/** @internal */
	protected _postProcess: PostProcess = null;
	/** @internal */
	protected _enableHDR: boolean = false;
	/** @internal */
	private _viewportParams: Vector4 = new Vector4();
	/** @internal */
	private _projectionParams: Vector4 = new Vector4();
	/** @internal*/
	protected _needBuiltInRenderTexture: boolean = false;
	/**@internal */
	protected _msaa:boolean = false;

	/** @internal*/
	private _depthTextureMode: number;
	/** @internal */
	_offScreenRenderTexture: RenderTexture = null;
	/** @internal */
	_internalRenderTexture: RenderTexture = null;
	/** @internal???????????????????????????????????????*/
	_canBlitDepth: boolean = false;
	/**@internal */
	_internalCommandBuffer: CommandBuffer = new CommandBuffer();
	/**?????????????????? */
	protected _depthTextureFormat: RenderTextureDepthFormat = RenderTextureDepthFormat.DEPTH_16;
	/** ????????????*/
	private _depthTexture: BaseTexture;
	/** ??????????????????*/
	private _depthNormalsTexture: RenderTexture;

	private _cameraEventCommandBuffer: { [key: string]: CommandBuffer[] } = {};

	/** @internal */
	_clusterXPlanes: Vector3[];
	/** @internal */
	_clusterYPlanes: Vector3[];
	/** @internal */
	_clusterPlaneCacheFlag: Vector2 = new Vector2(-1, -1);
	/** @internal */
	_screenOffsetScale: Vector4 = new Vector4();

	/**?????????????????????*/
	enableRender: boolean = true;
	/**???????????????*/
	clearFlag: CameraClearFlags = CameraClearFlags.SolidColor;

	/**
	 * ????????????
	 */
	get aspectRatio(): number {
		if (this._aspectRatio === 0) {
			var vp: Viewport = this.viewport;
			return vp.width / vp.height;
		}
		return this._aspectRatio;
	}

	set aspectRatio(value: number) {
		if (value < 0)
			throw new Error("Camera: the aspect ratio has to be a positive real number.");
		this._aspectRatio = value;
		this._calculateProjectionMatrix();
	}

	/**
	 * ????????????????????????????????????
	 */
	get viewport(): Viewport {//TODO:??????
		if (this._offScreenRenderTexture)
			this._calculationViewport(this._normalizedViewport, this._offScreenRenderTexture.width, this._offScreenRenderTexture.height);
		else
			this._calculationViewport(this._normalizedViewport, this.clientWidth, this.clientHeight);//???????????????????????????,????????????
		return this._viewport;
	}

	set viewport(value: Viewport) {
		var width: number;
		var height: number;
		if (this._offScreenRenderTexture) {
			width = this._offScreenRenderTexture.width;
			height = this._offScreenRenderTexture.height;
		} else {
			width = this.clientWidth;
			height = this.clientHeight;
		}
		this._normalizedViewport.x = value.x / width;
		this._normalizedViewport.y = value.y / height;
		this._normalizedViewport.width = value.width / width;
		this._normalizedViewport.height = value.height / height;
		this._calculationViewport(this._normalizedViewport, width, height);
		this._calculateProjectionMatrix();
	}

	get clientWidth(): number {
		if (Config3D._config.customPixel)
			return Config3D._config.pixResolWidth | 0;
		else
			return RenderContext3D.clientWidth * Config3D._config.pixelRatio | 0;
	}

	get clientHeight(): number {
		if (Config3D._config.customPixel)
			return Config3D._config.pixResolHeight | 0;
		else
			return RenderContext3D.clientHeight * Config3D._config.pixelRatio | 0;
	}

	/**
	 * ?????????????????????
	 */
	set msaa(value:boolean){
		LayaGL.layaGPUInstance._isWebGL2?this._msaa = value:this._msaa = false;
	}

	get msaa():boolean{
		return this._msaa;
	}

	/**
	 * ????????????????????????
	 */
	get normalizedViewport(): Viewport {
		return this._normalizedViewport;
	}

	set normalizedViewport(value: Viewport) {
		var width: number;
		var height: number;
		if (this._offScreenRenderTexture) {
			width = this._offScreenRenderTexture.width;
			height = this._offScreenRenderTexture.height;
		} else {
			width = this.clientWidth;
			height = this.clientHeight;
		}
		if (this._normalizedViewport !== value)
			value.cloneTo(this._normalizedViewport);
		this._calculationViewport(value, width, height);
		this._calculateProjectionMatrix();
	}

	/**
	 * ?????????????????????
	 */
	get viewMatrix(): Matrix4x4 {
		if (this._updateViewMatrix) {
			var scale: Vector3 = this.transform.getWorldLossyScale();
			var scaleX: number = scale.x;
			var scaleY: number = scale.y;
			var scaleZ: number = scale.z;
			var viewMatE: Float32Array = this._viewMatrix.elements;

			this.transform.worldMatrix.cloneTo(this._viewMatrix)
			viewMatE[0] /= scaleX;//????????????
			viewMatE[1] /= scaleX;
			viewMatE[2] /= scaleX;
			viewMatE[4] /= scaleY;
			viewMatE[5] /= scaleY;
			viewMatE[6] /= scaleY;
			viewMatE[8] /= scaleZ;
			viewMatE[9] /= scaleZ;
			viewMatE[10] /= scaleZ;
			this._viewMatrix.invert(this._viewMatrix);
			this._updateViewMatrix = false;
		}
		return this._viewMatrix;
	}

	/**
	 * ???????????????
	 */
	get projectionMatrix(): Matrix4x4 {
		return this._projectionMatrix;
	}

	set projectionMatrix(value: Matrix4x4) {
		this._projectionMatrix = value;
		this._useUserProjectionMatrix = true;
	}

	/**
	 * ???????????????????????????
	 */
	get projectionViewMatrix(): Matrix4x4 {
		Matrix4x4.multiply(this.projectionMatrix, this.viewMatrix, this._projectionViewMatrix);
		return this._projectionViewMatrix;
	}

	/**
	 * ????????????????????????
	 */
	get boundFrustum(): BoundFrustum {
		this._boundFrustum.matrix = this.projectionViewMatrix;

		return this._boundFrustum;
	}

	/**
	 * ???????????????????????????????????????
	 */
	get renderTarget(): RenderTexture {
		return this._offScreenRenderTexture;
	}

	set renderTarget(value: RenderTexture) {
		var lastValue: RenderTexture = this._offScreenRenderTexture;
		if (lastValue !== value) {
			(lastValue) && (lastValue._isCameraTarget = false);
			(value) && (value._isCameraTarget = true);
			this._offScreenRenderTexture = value;
			this._calculateProjectionMatrix();
		}
	}

	/**
	 * ???????????????
	 */
	get postProcess(): PostProcess {
		return this._postProcess;
	}

	set postProcess(value: PostProcess) {
		this._postProcess = value;
		if (!value) return;
		value && value._init(this);
	}

	/**
	 * ????????????HDR???
	 * ????????????????????????????????????
	 */
	get enableHDR(): boolean {
		return this._enableHDR;
	}

	set enableHDR(value: boolean) {
		if (value && !SystemUtils.supportRenderTextureFormat(RenderTextureFormat.R16G16B16A16)) {
			console.warn("Camera:can't enable HDR in this device.");
			return;
		}
		this._enableHDR = value;
	}

	/**
	 * ???????????????????????????RenderTexture???CommandBuffer??????????????????true
	 * ?????????CommandBuffer????????????
	 */
	get enableBuiltInRenderTexture(): boolean {
		return this._needBuiltInRenderTexture;
	}

	set enableBuiltInRenderTexture(value: boolean) {
		this._needBuiltInRenderTexture = value;
	}

	/**
	 * ??????????????????
	 */
	get depthTextureMode(): number {
		return this._depthTextureMode;
	}
	set depthTextureMode(value: number) {
		this._depthTextureMode = value;
	}

	/**
	 * ??????????????????
	 */
	get depthTextureFormat(): RenderTextureDepthFormat {
		return this._depthTextureFormat;
	}
	set depthTextureFormat(value: RenderTextureDepthFormat) {
		this._depthTextureFormat = value;
	}
	/**
	 * ???????????????????????????????????????(TODO:????????????,??????????????????????????????????????????????????????????????????)
	 */
	set enableBlitDepth(value: boolean) {
		this._canBlitDepth = value;
		if (value)
			this._internalRenderTexture && (this._internalRenderTexture.depthAttachMode = RTDEPTHATTACHMODE.TEXTURE);
		else
			this._internalRenderTexture && (this._internalRenderTexture.depthAttachMode = RTDEPTHATTACHMODE.RENDERBUFFER);

	}

	get canblitDepth() {
		return this._canBlitDepth && this._internalRenderTexture && this._internalRenderTexture.depthStencilFormat != RenderTextureDepthFormat.DEPTHSTENCIL_NONE && this._internalRenderTexture.depthAttachMode == RTDEPTHATTACHMODE.TEXTURE;
	}

	/**
	 * ???????????? <code>Camera</code> ?????????
	 * @param	aspectRatio ????????????
	 * @param	nearPlane ????????????
	 * @param	farPlane ????????????
	 */
	constructor(aspectRatio: number = 0, nearPlane: number = 0.3, farPlane: number = 1000) {
		super(nearPlane, farPlane);
		this._viewMatrix = new Matrix4x4();
		this._projectionMatrix = new Matrix4x4();
		this._projectionViewMatrix = new Matrix4x4();
		this._viewport = new Viewport(0, 0, 0, 0);
		this._normalizedViewport = new Viewport(0, 0, 1, 1);
		this._rayViewport = new Viewport(0, 0, 0, 0);
		this._aspectRatio = aspectRatio;
		this._boundFrustum = new BoundFrustum(new Matrix4x4());

		this._calculateProjectionMatrix();
		Laya.stage.on(Event.RESIZE, this, this._onScreenSizeChanged);
		this.transform.on(Event.TRANSFORM_CHANGED, this, this._onTransformChanged);
	}

	/**
	 * @internal
	 */
	private _calculationViewport(normalizedViewport: Viewport, width: number, height: number): void {
		var lx: number = normalizedViewport.x * width;//????????????x??????
		var ly: number = normalizedViewport.y * height;//????????????y??????
		var rx: number = lx + Math.max(normalizedViewport.width * width, 0);
		var ry: number = ly + Math.max(normalizedViewport.height * height, 0);

		var ceilLeftX: number = Math.ceil(lx);
		var ceilLeftY: number = Math.ceil(ly);
		var floorRightX: number = Math.floor(rx);
		var floorRightY: number = Math.floor(ry);

		var pixelLeftX: number = ceilLeftX - lx >= 0.5 ? Math.floor(lx) : ceilLeftX;
		var pixelLeftY: number = ceilLeftY - ly >= 0.5 ? Math.floor(ly) : ceilLeftY;
		var pixelRightX: number = rx - floorRightX >= 0.5 ? Math.ceil(rx) : floorRightX;
		var pixelRightY: number = ry - floorRightY >= 0.5 ? Math.ceil(ry) : floorRightY;

		this._viewport.x = pixelLeftX;
		this._viewport.y = pixelLeftY;
		this._viewport.width = pixelRightX - pixelLeftX;
		this._viewport.height = pixelRightY - pixelLeftY;
	}

	/**
	 * @inheritDoc
	 * @override
	 * @internal
	 */
	protected _calculateProjectionMatrix(): void {
		if (!this._useUserProjectionMatrix) {
			if (this._orthographic) {
				var halfHeight: number = this.orthographicVerticalSize * 0.5;
				var halfWidth: number = halfHeight * this.aspectRatio;
				Matrix4x4.createOrthoOffCenter(-halfWidth, halfWidth, -halfHeight, halfHeight, this.nearPlane, this.farPlane, this._projectionMatrix);
			} else {
				Matrix4x4.createPerspective(3.1416 * this.fieldOfView / 180.0, this.aspectRatio, this.nearPlane, this.farPlane, this._projectionMatrix);
			}
		}
	}

	/**
	 *	??????????????????????????????????????????
	 * 	@param  layer ??????
	 * 	@return ???????????????
	 */
	_isLayerVisible(layer: number): boolean {
		return (Math.pow(2, layer) & this.cullingMask) != 0;
	}

	/**
	 * @internal
	 */
	_onTransformChanged(flag: number): void {
		flag &= Transform3D.TRANSFORM_WORLDMATRIX;//????????????TRANSFORM??????
		(flag) && (this._updateViewMatrix = true);
	}

	/**
	 * @inheritDoc
	 * @override
	 * @internal
	 */
	_parse(data: any, spriteMap: any): void {
		super._parse(data, spriteMap);
		var clearFlagData: any = data.clearFlag;
		(clearFlagData !== undefined) && (this.clearFlag = clearFlagData);
		var viewport: any[] = data.viewport;
		this.normalizedViewport = new Viewport(viewport[0], viewport[1], viewport[2], viewport[3]);
		var enableHDR: boolean = data.enableHDR;
		(enableHDR !== undefined) && (this.enableHDR = enableHDR);
	}

	clone(): Camera {
		let camera = <Camera>super.clone();
		camera.clearFlag = this.clearFlag;
		camera.viewport = this.viewport;
		this.normalizedViewport.cloneTo(camera.normalizedViewport);
		camera.enableHDR = this.enableHDR;
		camera.farPlane = this.farPlane;
		camera.nearPlane = this.nearPlane;
		camera.fieldOfView = this.fieldOfView;
		camera.orthographic = this.orthographic;
		return camera;
	}

	/**
	 * @internal
	 */
	_getCanvasWidth(): number {
		if (this._offScreenRenderTexture)
			return this._offScreenRenderTexture.width;
		else
			return this.clientWidth;
	}

	/**
	 * @internal
	 */
	_getCanvasHeight(): number {
		if (this._offScreenRenderTexture)
			return this._offScreenRenderTexture.height;
		else
			return this.clientHeight;
	}

	/**
	 * @internal
	 */
	_getRenderTexture(): RenderTexture {
		return this._internalRenderTexture || this._offScreenRenderTexture;
	}

	/**
	 * @internal
	 */
	_needInternalRenderTexture(): boolean {
		return (this._postProcess && this._postProcess.enable) || this._enableHDR || this._needBuiltInRenderTexture ? true : false;//condition of internal RT
	}

	/**
	 * @internal
	 */
	_getRenderTextureFormat(): number {
		if (this._enableHDR)
			return RenderTextureFormat.R16G16B16A16;
		else
			return RenderTextureFormat.R8G8B8;
	}

	/**
	 * @override
	 * @internal
	 */
	_prepareCameraToRender(): void {
		super._prepareCameraToRender();
		var vp: Viewport = this.viewport;
		this._viewportParams.setValue(vp.x, vp.y, vp.width, vp.height);
		this._projectionParams.setValue(this._nearPlane, this._farPlane, RenderContext3D._instance.invertY ? -1 : 1, 1 / this.farPlane);
		this._shaderValues.setVector(BaseCamera.VIEWPORT, this._viewportParams);
		this._shaderValues.setVector(BaseCamera.PROJECTION_PARAMS, this._projectionParams);
	}

	/**
	 * @internal
	 */
	_applyViewProject(context: RenderContext3D, viewMat: Matrix4x4, proMat: Matrix4x4): void {
		var projectView: Matrix4x4;
		var shaderData: ShaderData = this._shaderValues;
		if (context.invertY) {
			Matrix4x4.multiply(BaseCamera._invertYScaleMatrix, proMat, BaseCamera._invertYProjectionMatrix);
			Matrix4x4.multiply(BaseCamera._invertYProjectionMatrix, viewMat, BaseCamera._invertYProjectionViewMatrix);
			proMat = BaseCamera._invertYProjectionMatrix;
			projectView = BaseCamera._invertYProjectionViewMatrix;
		}
		else {
			Matrix4x4.multiply(proMat, viewMat, this._projectionViewMatrix);
			projectView = this._projectionViewMatrix;
		}

		context.viewMatrix = viewMat;
		context.projectionMatrix = proMat;
		context.projectionViewMatrix = projectView;
		shaderData.setMatrix4x4(BaseCamera.VIEWMATRIX, viewMat);
		shaderData.setMatrix4x4(BaseCamera.PROJECTMATRIX, proMat);
		shaderData.setMatrix4x4(BaseCamera.VIEWPROJECTMATRIX, projectView);
	}

	/**
	 * @internal
	 */
	_updateClusterPlaneXY(): void {
		var fieldOfView: number = this.fieldOfView;
		var aspectRatio: number = this.aspectRatio;
		if (this._clusterPlaneCacheFlag.x !== fieldOfView || this._clusterPlaneCacheFlag.y !== aspectRatio) {
			var clusterCount: Vector3 = Config3D._config.lightClusterCount;
			var xSlixe: number = clusterCount.x, ySlice: number = clusterCount.y;
			var xCount: number = xSlixe + 1, yCount: number = ySlice + 1;
			var xPlanes: Vector3[] = this._clusterXPlanes, yPlanes: Vector3[] = this._clusterYPlanes;

			if (!xPlanes) {
				xPlanes = this._clusterXPlanes = new Array(xCount);
				yPlanes = this._clusterYPlanes = new Array(yCount);
				for (var i: number = 0; i < xCount; i++)
					xPlanes[i] = new Vector3();
				for (var i: number = 0; i < yCount; i++)
					yPlanes[i] = new Vector3();
			}

			var halfY = Math.tan((this.fieldOfView / 2) * Math.PI / 180);
			var halfX = this.aspectRatio * halfY;
			var yLengthPerCluster = 2 * halfY / xSlixe;
			var xLengthPerCluster = 2 * halfX / ySlice;
			for (var i: number = 0; i < xCount; i++) {
				var angle: number = -halfX + xLengthPerCluster * i;
				var bigHypot: number = Math.sqrt(1 + angle * angle);
				var normX: number = 1 / bigHypot;
				var xPlane: Vector3 = xPlanes[i];
				xPlane.setValue(normX, 0, -angle * normX);
			}
			//start from top is more similar to light pixel data
			for (var i: number = 0; i < yCount; i++) {
				var angle: number = halfY - yLengthPerCluster * i;
				var bigHypot: number = Math.sqrt(1 + angle * angle);
				var normY: number = -1 / bigHypot;
				var yPlane: Vector3 = yPlanes[i];
				yPlane.setValue(0, normY, -angle * normY);
			}

			this._clusterPlaneCacheFlag.x = fieldOfView;
			this._clusterPlaneCacheFlag.y = aspectRatio;
		}
	}


	/**
	 * ?????????????????????
	 * @param event 
	 * @param renderTarget 
	 * @param context 
	 */
	_applyCommandBuffer(event: number, context: RenderContext3D) {
		PerformancePlugin.begainSample(PerformancePlugin.PERFORMANCE_LAYA_3D_RENDER_RENDERCOMMANDBUFFER);
		var gl: WebGLRenderingContext = LayaGL.instance;
		var commandBufferArray: CommandBuffer[] = this._cameraEventCommandBuffer[event];
		if (!commandBufferArray || commandBufferArray.length == 0)
			return;
		// if(this._internalRenderTexture)
		// 	this._internalRenderTexture._end();
		commandBufferArray.forEach(function (value) {
			value._context = context;
			value._apply();
		});
		(RenderTexture.currentActive) && (RenderTexture.currentActive._end());
		if (this._internalRenderTexture || this._offScreenRenderTexture)
			this._getRenderTexture()._start();
		else {
			gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		}
		//TODO????????? ??????????????????
		gl.viewport(0, 0, context.viewport.width, context.viewport.height);
		PerformancePlugin.endSample(PerformancePlugin.PERFORMANCE_LAYA_3D_RENDER_RENDERCOMMANDBUFFER);
	}


	/**
	 * ??????????????????
	 * @internal
	 * @param scene ????????????
	 * @param context ???????????????
	 */
	_renderShadowMap(scene: Scene3D, context: RenderContext3D) {
		PerformancePlugin.begainSample(PerformancePlugin.PERFORMANCE_LAYA_3D_RENDER_SHADOWMAP);
		//render shadowMap
		var shadowCasterPass;
		var mainDirectLight: DirectionLight = scene._mainDirectionLight;
		var needShadowCasterPass: boolean = mainDirectLight && mainDirectLight.shadowMode !== ShadowMode.None && ShadowUtils.supportShadow();
		if (needShadowCasterPass) {
			scene._shaderValues.removeDefine(Scene3DShaderDeclaration.SHADERDEFINE_SHADOW_SPOT)
			scene._shaderValues.addDefine(Scene3DShaderDeclaration.SHADERDEFINE_SHADOW);
			shadowCasterPass = ILaya3D.Scene3D._shadowCasterPass;
			shadowCasterPass.update(this, mainDirectLight, ILaya3D.ShadowLightType.DirectionLight);
			shadowCasterPass.render(context, scene, ILaya3D.ShadowLightType.DirectionLight);
		}
		else {
			scene._shaderValues.removeDefine(Scene3DShaderDeclaration.SHADERDEFINE_SHADOW);
		}
		var spotMainLight: SpotLight = scene._mainSpotLight;
		var spotneedShadowCasterPass: boolean = spotMainLight && spotMainLight.shadowMode !== ShadowMode.None && ShadowUtils.supportShadow();
		if (spotneedShadowCasterPass) {
			scene._shaderValues.removeDefine(Scene3DShaderDeclaration.SHADERDEFINE_SHADOW);
			scene._shaderValues.addDefine(Scene3DShaderDeclaration.SHADERDEFINE_SHADOW_SPOT);
			shadowCasterPass = ILaya3D.Scene3D._shadowCasterPass;
			shadowCasterPass.update(this, spotMainLight, ILaya3D.ShadowLightType.SpotLight);
			shadowCasterPass.render(context, scene, ILaya3D.ShadowLightType.SpotLight);
		}
		else {
			scene._shaderValues.removeDefine(Scene3DShaderDeclaration.SHADERDEFINE_SHADOW_SPOT);
		}
		if (needShadowCasterPass)
			scene._shaderValues.addDefine(Scene3DShaderDeclaration.SHADERDEFINE_SHADOW);
		if (spotneedShadowCasterPass)
			scene._shaderValues.addDefine(Scene3DShaderDeclaration.SHADERDEFINE_SHADOW_SPOT);

		PerformancePlugin.endSample(PerformancePlugin.PERFORMANCE_LAYA_3D_RENDER_SHADOWMAP);
		return needShadowCasterPass || spotneedShadowCasterPass;

	}

	/**
	 * ?????????????????????
	 * @internal
	 * @param context ???????????????
	 * @param scene ????????????
	 * @param needInternalRT ??????????????????Rendertarget
	 * @param viewport ??????
	 */
	_preRenderMainPass(context: RenderContext3D, scene: Scene3D, needInternalRT: boolean, viewport: Viewport) {
		context.camera = this;
		context.cameraShaderValue = this._shaderValues;
		Camera._updateMark++;
		scene._preRenderScript();//TODO:duo??????????????????
		var gl: WebGLRenderingContext = LayaGL.instance;
		//TODO:webgl2 should use blitFramebuffer
		//TODO:if adjacent camera param can use same internal RT can merge
		//if need internal RT and no off screen RT and clearFlag is DepthOnly or Nothing, should grab the backBuffer
		if (needInternalRT && !this._offScreenRenderTexture && (this.clearFlag == CameraClearFlags.DepthOnly || this.clearFlag == CameraClearFlags.Nothing)) {
			if (RenderTexture.bindCanvasRender) {//??????iOS?????????CopyTexSubImage2D????????????bug
				var blit: BlitScreenQuadCMD = BlitScreenQuadCMD.create(RenderTexture.bindCanvasRender, this._internalRenderTexture);
				blit.setContext(context);
				blit.run();
				blit.recover();
			} else {
				if (this._enableHDR) {//internal RT is HDR can't directly copy
					var grabTexture: RenderTexture = RenderTexture.createFromPool(viewport.width, viewport.height, RenderTextureFormat.R8G8B8, RenderTextureDepthFormat.DEPTH_16);
					grabTexture.filterMode = FilterMode.Bilinear;
					WebGLContext.bindTexture(gl, gl.TEXTURE_2D, grabTexture._getSource());
					gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, viewport.x, RenderContext3D.clientHeight - (viewport.y + viewport.height), viewport.width, viewport.height);
					var blit: BlitScreenQuadCMD = BlitScreenQuadCMD.create(grabTexture, this._internalRenderTexture);
					blit.setContext(context);
					blit.run();
					blit.recover();
					RenderTexture.recoverToPool(grabTexture);
				}
				else {
					WebGLContext.bindTexture(gl, gl.TEXTURE_2D, this._internalRenderTexture._getSource());
					gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, viewport.x, RenderContext3D.clientHeight - (viewport.y + viewport.height), viewport.width, viewport.height);
				}
			}

		}
	}

	/**
	 * ???????????????
	 * @internal
	 * @param context ???????????????
	 * @param viewport ??????
	 * @param scene ??????
	 * @param shader shader
	 * @param replacementTag ????????????
	 * @param needInternalRT ??????????????????RT
	 */
	_renderMainPass(context: RenderContext3D, viewport: Viewport, scene: Scene3D, shader: Shader3D, replacementTag: string, needInternalRT: boolean) {
		var gl: WebGLRenderingContext = LayaGL.instance;
		var renderTex: RenderTexture = this._getRenderTexture();//???????????????renderTexture???????????????renderTexture,???????????????????????????????????????,???????????????renderTexture????????????????????????????????????

		if (renderTex && renderTex._isCameraTarget)//????????????Y????????????
			context.invertY = true;
		context.viewport = viewport;

		this._prepareCameraToRender();
		var multiLighting: boolean = Config3D._config._multiLighting;
		PerformancePlugin.begainSample(PerformancePlugin.PERFORMANCE_LAYA_3D_RENDER_CLUSTER);
		(multiLighting) && (Cluster.instance.update(this, <Scene3D>(scene)));
		PerformancePlugin.endSample(PerformancePlugin.PERFORMANCE_LAYA_3D_RENDER_CLUSTER);
		PerformancePlugin.begainSample(PerformancePlugin.PERFORMANCE_LAYA_3D_RENDER_CULLING);
		scene._preCulling(context, this, shader, replacementTag);
		PerformancePlugin.endSample(PerformancePlugin.PERFORMANCE_LAYA_3D_RENDER_CULLING);

		this._applyViewProject(context, this.viewMatrix, this._projectionMatrix);
		if (this.depthTextureMode != 0) {
			//TODO:?????????????????????
			this._renderDepthMode(context);
		}

		// todo layame temp
		(renderTex) && (renderTex._start());

		scene._clear(gl, context);

		this._applyCommandBuffer(CameraEventFlags.BeforeForwardOpaque, context);
		PerformancePlugin.begainSample(PerformancePlugin.PERFORMANCE_LAYA_3D_RENDER_RENDEROPAQUE);
		scene._renderScene(context, ILaya3D.Scene3D.SCENERENDERFLAG_RENDERQPAQUE);
		PerformancePlugin.endSample(PerformancePlugin.PERFORMANCE_LAYA_3D_RENDER_RENDEROPAQUE);
		this._applyCommandBuffer(CameraEventFlags.BeforeSkyBox, context);
		scene._renderScene(context, ILaya3D.Scene3D.SCENERENDERFLAG_SKYBOX);
		this._applyCommandBuffer(CameraEventFlags.BeforeTransparent, context);
		PerformancePlugin.begainSample(PerformancePlugin.PERFORMANCE_LAYA_3D_RENDER_RENDERTRANSPARENT);
		scene._renderScene(context, ILaya3D.Scene3D.SCENERENDERFLAG_RENDERTRANSPARENT);
		PerformancePlugin.endSample(PerformancePlugin.PERFORMANCE_LAYA_3D_RENDER_RENDERTRANSPARENT);
		scene._postRenderScript();//TODO:duo??????????????????
		this._applyCommandBuffer(CameraEventFlags.BeforeImageEffect, context);
		(renderTex) && (renderTex._end());

		if (needInternalRT) {
			if (this._postProcess && this._postProcess.enable) {
				PerformancePlugin.begainSample(PerformancePlugin.PERFORMANCE_LAYA_3D_RENDER_POSTPROCESS);
				this._postProcess.commandContext = context;
				this._postProcess._render();
				this._postProcess._applyPostProcessCommandBuffers();
				PerformancePlugin.endSample(PerformancePlugin.PERFORMANCE_LAYA_3D_RENDER_POSTPROCESS);
			} else if (this._enableHDR || this._needBuiltInRenderTexture) {
				var canvasWidth: number = this._getCanvasWidth(), canvasHeight: number = this._getCanvasHeight();
				if (this._offScreenRenderTexture) {
					this._screenOffsetScale.setValue(viewport.x / canvasWidth, viewport.y / canvasHeight, viewport.width / canvasWidth, viewport.height / canvasHeight);
					this._internalCommandBuffer._camera = this;
					this._internalCommandBuffer._context = context;
					this._internalCommandBuffer.blitScreenQuad(this._internalRenderTexture, this._offScreenRenderTexture, this._screenOffsetScale, null, null, 0, true);
					this._internalCommandBuffer._apply();
					this._internalCommandBuffer.clear();
				}
			}
			RenderTexture.bindCanvasRender = this._internalRenderTexture;
			//RenderTexture.recoverToPool(this._internalRenderTexture);
		} else {
			RenderTexture.bindCanvasRender = null;
		}
		this._applyCommandBuffer(CameraEventFlags.AfterEveryThing, context);
	}

	/**
	 * ??????camera???????????????????????????????????????
	 * @internal
	 */
	_renderDepthMode(context: RenderContext3D) {
		PerformancePlugin.begainSample(PerformancePlugin.PERFORMANCE_LAYA_3D_RENDER_RENDERDEPTHMDOE);
		var cameraDepthMode = this._depthTextureMode;
		if ((cameraDepthMode & DepthTextureMode.Depth) != 0) {
			if (!this.canblitDepth || !this._internalRenderTexture.depthStencilTexture) {
				Camera.depthPass.update(this, DepthTextureMode.Depth, this._depthTextureFormat);
				Camera.depthPass.render(context, DepthTextureMode.Depth);
			}
			else {
				this.depthTexture = this._internalRenderTexture.depthStencilTexture;
				//@ts-ignore;
				Camera.depthPass._depthTexture = this.depthTexture;
				Camera.depthPass._setupDepthModeShaderValue(DepthTextureMode.Depth, this);
			}
		}
		if ((cameraDepthMode & DepthTextureMode.DepthNormals) != 0) {
			Camera.depthPass.update(this, DepthTextureMode.DepthNormals, this._depthTextureFormat);
			Camera.depthPass.render(context, DepthTextureMode.DepthNormals);
		}
		PerformancePlugin.endSample(PerformancePlugin.PERFORMANCE_LAYA_3D_RENDER_RENDERDEPTHMDOE);
	}

	/**
	 * @internal
	 * ????????????
	 */
	get depthTexture(): BaseTexture {
		return this._depthTexture;
	}

	set depthTexture(value: BaseTexture) {
		this._depthTexture = value;
	}

	/**
	 * @internal
	 * ??????????????????
	 */
	get depthNormalTexture(): RenderTexture {
		return this._depthNormalsTexture;
	}

	set depthNormalTexture(value: RenderTexture) {
		this._depthNormalsTexture = value;
	}


	/**
	 * @internal
	 * @param needShadowPass 
	 */
	_aftRenderMainPass(needShadowPass: Boolean) {
		if (needShadowPass)
			ILaya3D.Scene3D._shadowCasterPass.cleanUp();
		Camera.depthPass.cleanUp();
	}


	/**
	 * @override
	 * @param shader ?????????
	 * @param replacementTag ???????????????
	 */
	render(shader: Shader3D = null, replacementTag: string = null): void {
		if (!this.activeInHierarchy) //custom render should protected with activeInHierarchy=true
			return;

		var viewport: Viewport = this.viewport;
		var needInternalRT: boolean = this._needInternalRenderTexture();
		var context: RenderContext3D = RenderContext3D._instance;
		var scene: Scene3D = context.scene = <Scene3D>this._scene;
		context.pipelineMode = context.configPipeLineMode;
		context.replaceTag = replacementTag;
		context.customShader = shader;
		if (needInternalRT) {
			if(this._msaa&&LayaGL.layaGPUInstance._isWebGL2)
			{
				this._internalRenderTexture = MulSampleRenderTexture.createFromPool(viewport.width, viewport.height, this._getRenderTextureFormat(), this._depthTextureFormat);
				this._internalRenderTexture.filterMode = FilterMode.Bilinear;
			}else{
				this._internalRenderTexture = RenderTexture.createFromPool(viewport.width, viewport.height, this._getRenderTextureFormat(), this._depthTextureFormat);
				this._internalRenderTexture.filterMode = FilterMode.Bilinear;
			}
			
		}
		else {
			this._internalRenderTexture = null;
		}
		var needShadowCasterPass: boolean = this._renderShadowMap(scene, context);
		this._preRenderMainPass(context, scene, needInternalRT, viewport);
		this._renderMainPass(context, viewport, scene, shader, replacementTag, needInternalRT);
		this._aftRenderMainPass(needShadowCasterPass);

	}


	/**
	 * ???????????????????????????????????????
	 * @param point ??????????????????????????????
	 * @param out  ???????????????
	 */
	viewportPointToRay(point: Vector2, out: Ray): void {
		this._rayViewport.x = this.viewport.x;
		this._rayViewport.y = this.viewport.y;
		this._rayViewport.width = Laya.stage._width;
		this._rayViewport.height = Laya.stage._height;
		Picker.calculateCursorRay(point, this._rayViewport, this._projectionMatrix, this.viewMatrix, null, out);
	}

	/** 
	 * ???????????????????????????????????????
	 * @param point ????????????????????????
	 * @param out  ???????????????
	 */
	normalizedViewportPointToRay(point: Vector2, out: Ray): void {
		var finalPoint: Vector2 = Camera._tempVector20;
		var vp: Viewport = this.normalizedViewport;
		point.x = point.x * Config3D._config.pixelRatio;
		point.y = point.y * Config3D._config.pixelRatio;
		finalPoint.x = point.x * vp.width;
		finalPoint.y = point.y * vp.height;

		Picker.calculateCursorRay(finalPoint, this.viewport, this._projectionMatrix, this.viewMatrix, null, out);
	}

	/**
	 * ???????????????????????????????????????????????????
	 * @param position ????????????????????????
	 * @param out  x???y???z?????????????????????,w????????????????????????z????????????
	 */
	worldToViewportPoint(position: Vector3, out: Vector4): void {
		Matrix4x4.multiply(this._projectionMatrix, this._viewMatrix, this._projectionViewMatrix);
		this.viewport.project(position, this._projectionViewMatrix, out);
		var r = Config3D._config.pixelResol;
		let _wr = (out.x - this.viewport.x) / r;
		let _hr = (out.y - this.viewport.y) / r;
		out.x = _wr + this.viewport.x;
		out.y = _hr + this.viewport.y;

		out.x = (out.x / Laya.stage.clientScaleX) | 0;
		out.y = (out.y / Laya.stage.clientScaleY) | 0;
	}

	/**
	 * ????????????????????????????????????????????????????????????
	 * @param position ????????????????????????
	 * @param out  x???y???z??????????????????????????????,w????????????????????????z????????????
	 */
	worldToNormalizedViewportPoint(position: Vector3, out: Vector4): void {
		this.worldToViewportPoint(position, out);
		out.x = out.x / Laya.stage.width;
		out.y = out.y / Laya.stage.height;
	}

	/**
	 * ??????2D?????????????????????3D????????????????????????????????????:??????????????????????????????
	 * @param   source ????????????
	 * @param   out ???????????????
	 * @return ?????????????????????
	 */
	convertScreenCoordToOrthographicCoord(source: Vector3, out: Vector3): boolean {//TODO:??????????????????viewport??????
		if (this._orthographic) {
			var clientWidth: number = this.clientWidth;
			var clientHeight: number = this.clientHeight;
			var ratioX: number = this.orthographicVerticalSize * this.aspectRatio / clientWidth;
			var ratioY: number = this.orthographicVerticalSize / clientHeight;
			out.x = (-clientWidth / 2 + source.x * Laya.stage.clientScaleX) * ratioX;
			out.y = (clientHeight / 2 - source.y * Laya.stage.clientScaleY) * ratioY;
			out.z = (this.nearPlane - this.farPlane) * (source.z + 1) / 2 - this.nearPlane;
			Vector3.transformCoordinate(out, this.transform.worldMatrix, out);
			return true;
		} else {
			return false;
		}
	}

	/**
	 * @inheritDoc
	 * @override
	 */
	destroy(destroyChild: boolean = true): void {
		this._offScreenRenderTexture = null;
		this.transform.off(Event.TRANSFORM_CHANGED, this, this._onTransformChanged);
		super.destroy(destroyChild);
	}

	/**
	 * ??????camera????????????????????????
	 * @param event ??????????????????
	 * @param commandBuffer ???????????????
	 */
	addCommandBuffer(event: CameraEventFlags, commandBuffer: CommandBuffer): void {
		var commandBufferArray: CommandBuffer[] = this._cameraEventCommandBuffer[event];
		if (!commandBufferArray) commandBufferArray = this._cameraEventCommandBuffer[event] = [];
		if (commandBufferArray.indexOf(commandBuffer) < 0)
			commandBufferArray.push(commandBuffer);
		commandBuffer._camera = this;
	}

	/**
	 * ??????camera????????????????????????
	 * @param event ??????????????????
	 * @param commandBuffer ???????????????
	 */
	removeCommandBuffer(event: CameraEventFlags, commandBuffer: CommandBuffer): void {
		var commandBufferArray: CommandBuffer[] = this._cameraEventCommandBuffer[event];
		if (commandBufferArray) {
			var index: number = commandBufferArray.indexOf(commandBuffer);
			if (index != -1) commandBufferArray.splice(index, 1);
		}
		else
			throw "Camera:unknown event.";
	}

	/**
	 * ??????camera?????????????????????????????????
	 * @param event ??????????????????
	 */
	removeCommandBuffers(event: CameraEventFlags): void {
		if (this._cameraEventCommandBuffer[event])
			this._cameraEventCommandBuffer[event].length = 0;
	}

	/**
	 * @internal
	 */
	protected _create(): Node {
		return new Camera();
	}

	/** @internal [NATIVE]*/
	_boundFrustumBuffer: Float32Array;
}

