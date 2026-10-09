import * as THREE from 'three';
import {scene} from './renderer.js';

const hemi=new THREE.HemisphereLight(0xffffff,0x8a8f99,0.35);scene.add(hemi);
/* Shadow catcher: darkness follows each light's share of the total light, so weak lights cast faint shadows. */
const ambU={value:.6};
const SHADOW_CHUNK=`
uniform float uAmbientW;
float lightW( vec3 c ) { return max( max( c.r, c.g ), c.b ); }
float getShadowMask() {
	float lit = uAmbientW;
	float total = uAmbientW;
	#ifdef USE_SHADOWMAP
	#if NUM_DIR_LIGHT_SHADOWS > 0
	DirectionalLightShadow directionalLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
		directionalLight = directionalLightShadows[ i ];
		total += lightW( directionalLights[ i ].color );
		lit += lightW( directionalLights[ i ].color ) * ( receiveShadow ? getShadow( directionalShadowMap[ i ], directionalLight.shadowMapSize, directionalLight.shadowBias, directionalLight.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0 );
	}
	#pragma unroll_loop_end
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
	SpotLightShadow spotLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHT_SHADOWS; i ++ ) {
		spotLight = spotLightShadows[ i ];
		total += lightW( spotLights[ i ].color );
		lit += lightW( spotLights[ i ].color ) * ( receiveShadow ? getShadow( spotShadowMap[ i ], spotLight.shadowMapSize, spotLight.shadowBias, spotLight.shadowRadius, vSpotShadowCoord[ i ] ) : 1.0 );
	}
	#pragma unroll_loop_end
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
	PointLightShadow pointLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_POINT_LIGHT_SHADOWS; i ++ ) {
		pointLight = pointLightShadows[ i ];
		total += lightW( pointLights[ i ].color );
		lit += lightW( pointLights[ i ].color ) * ( receiveShadow ? getPointShadow( pointShadowMap[ i ], pointLight.shadowMapSize, pointLight.shadowBias, pointLight.shadowRadius, vPointShadowCoord[ i ], pointLight.shadowCameraNear, pointLight.shadowCameraFar ) : 1.0 );
	}
	#pragma unroll_loop_end
	#endif
	#endif
	#if NUM_DIR_LIGHTS > NUM_DIR_LIGHT_SHADOWS
	for ( int j = NUM_DIR_LIGHT_SHADOWS; j < NUM_DIR_LIGHTS; j ++ ) { float w = lightW( directionalLights[ j ].color ); total += w; lit += w; }
	#endif
	#if NUM_SPOT_LIGHTS > NUM_SPOT_LIGHT_SHADOWS
	for ( int j = NUM_SPOT_LIGHT_SHADOWS; j < NUM_SPOT_LIGHTS; j ++ ) { float w = lightW( spotLights[ j ].color ); total += w; lit += w; }
	#endif
	#if NUM_POINT_LIGHTS > NUM_POINT_LIGHT_SHADOWS
	for ( int j = NUM_POINT_LIGHT_SHADOWS; j < NUM_POINT_LIGHTS; j ++ ) { float w = lightW( pointLights[ j ].color ); total += w; lit += w; }
	#endif
	return total > 0.0 ? lit / total : 1.0;
}
`;
const groundMat=new THREE.ShadowMaterial({opacity:.55});
groundMat.onBeforeCompile=sh=>{sh.uniforms.uAmbientW=ambU;sh.fragmentShader=sh.fragmentShader.replace('#include <shadowmask_pars_fragment>',SHADOW_CHUNK);};
const ground=new THREE.Mesh(new THREE.PlaneGeometry(4000,4000),groundMat);
ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;scene.add(ground);
const wall=new THREE.Mesh(new THREE.PlaneGeometry(4000,4000),groundMat);
wall.receiveShadow=true;scene.add(wall);
const lightRoot=new THREE.Group();scene.add(lightRoot);
const pivot=new THREE.Group(),comp=new THREE.Group();
pivot.add(comp);scene.add(pivot);

export {ambU,comp,ground,groundMat,hemi,lightRoot,pivot,wall};
