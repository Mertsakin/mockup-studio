import * as THREE from 'three';

/* Soft shadows whose blur follows the light source size and the distance between caster and receiver (PCSS).
   Works on BasicShadowMap: shadow maps are plain depth textures (nearest-filtered sampler2D / samplerCube),
   so the blocker search can read raw depths. The BASIC getShadow / getPointShadow are renamed *Hard and
   replaced by PCSS versions with the same signatures.
   shadow.radius carries the per-light size parameter: >0 parallel projection, <0 perspective (far = 10 x near),
   point lights: source size * 100 (world units). Formulas live in updateLights (lights/runtime.js). */
const HELPERS=`
	uniform float pcssSeed;
	float pcssNoise() { return fract( 52.9829189 * fract( dot( gl_FragCoord.xy + pcssSeed * vec2( 17.0, 59.0 ), vec2( 0.06711056, 0.00583715 ) ) ) ); }
	vec2 pcssVogel( int i, float n, float phi ) { float r = sqrt( ( float( i ) + 0.5 ) / n ); float t = float( i ) * 2.39996323 + phi; return r * vec2( cos( t ), sin( t ) ); }
	float pcssLin( float z ) { return 10.0 / ( 10.0 - z * 9.0 ); }
	float pcssShadow( sampler2D smap, vec2 mapSize, float pk, vec2 uv, float z ) {
		vec2 texel = vec2( 1.0 ) / mapSize;
		bool persp = pk < 0.0;
		float k = abs( pk ) / 1000.0;
		float phi = pcssNoise() * 6.2831853;
		float zr = persp ? pcssLin( z ) : z;
		float b0 = max( 1.0, zr * 0.4 );
		float search = persp ? k * ( zr - b0 ) / ( zr * b0 ) : k * 0.3;
		search = clamp( search, 2.0 * texel.x, 0.12 );
		float sum = 0.0; float cnt = 0.0;
		for ( int i = 0; i < 16; i ++ ) {
			vec2 o = pcssVogel( i, 16.0, phi ) * search;
			float d = texture2D( smap, uv + o ).r;
			float dv = persp ? pcssLin( d ) : d;
			float zt = persp ? zr * ( 1.0 - length( o ) * 0.6 ) : z - length( o ) * 0.35;
			if ( dv < zt ) { sum += dv; cnt += 1.0; }
		}
		if ( cnt < 0.5 ) return 1.0;
		float zb = sum / cnt;
		float pen = persp ? k * ( zr - zb ) / ( zr * zb ) : k * ( z - zb );
		float r = clamp( pen, 1.5 * texel.x, 0.15 );
		float lit = 0.0;
		for ( int i = 0; i < 40; i ++ ) {
			vec2 o = pcssVogel( i, 40.0, phi ) * r;
			float d = texture2D( smap, uv + o ).r;
			float dv = persp ? pcssLin( d ) : d;
			float zt = persp ? zr * ( 1.0 - length( o ) * 0.6 ) : z - length( o ) * 0.35;
			lit += dv < zt ? 0.0 : 1.0;
		}
		return lit / 40.0;
	}
	float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
		float shadow = 1.0;
		shadowCoord.xyz /= shadowCoord.w;
		shadowCoord.z += shadowBias;
		bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
		if ( inFrustum && shadowCoord.z <= 1.0 ) shadow = pcssShadow( shadowMap, shadowMapSize, shadowRadius, shadowCoord.xy, shadowCoord.z );
		return mix( 1.0, shadow, shadowIntensity );
	}
`;
// Cube depth maps store perspective depth along each face's axis; convert a sample back to radial distance.
const POINT=`
	float pcssCubeDist( samplerCube smap, vec3 dir, float near, float far ) {
		vec3 a = abs( dir );
		float axis = max( max( a.x, a.y ), a.z );
		float dp = textureCube( smap, dir ).r;
		float z = far * near / ( far - dp * ( far - near ) );
		return z * length( dir ) / axis;
	}
	float getPointShadow( samplerCube shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord, float shadowCameraNear, float shadowCameraFar ) {
		vec3 lightToPosition = shadowCoord.xyz;
		float range = shadowCameraFar - shadowCameraNear;
		float srcSize = abs( shadowRadius ) / 100.0;
		float distR = max( length( lightToPosition ), 0.0001 );
		float distC = distR + shadowBias * range;
		float texel = 0.5 / shadowMapSize.x;
		vec3 bd3D = normalize( lightToPosition );
		vec3 upv = abs( bd3D.y ) < 0.99 ? vec3( 0.0, 1.0, 0.0 ) : vec3( 1.0, 0.0, 0.0 );
		vec3 tu = normalize( cross( upv, bd3D ) ); vec3 tv = cross( bd3D, tu );
		float phi = pcssNoise() * 6.2831853;
		float search = clamp( srcSize * 0.6 / distR, 2.0 * texel, 0.3 );
		float sum = 0.0; float cnt = 0.0;
		for ( int i = 0; i < 16; i ++ ) {
			vec2 o = pcssVogel( i, 16.0, phi ) * search;
			float d = pcssCubeDist( shadowMap, bd3D + tu * o.x + tv * o.y, shadowCameraNear, shadowCameraFar );
			if ( d < distC - length( o ) * distR * 0.5 ) { sum += d; cnt += 1.0; }
		}
		if ( cnt < 0.5 ) return 1.0;
		float distB = max( sum / cnt, 0.0001 );
		float r = clamp( srcSize * ( distR - distB ) / ( distB * distR ), 2.0 * texel, 0.3 );
		float lit = 0.0;
		for ( int i = 0; i < 40; i ++ ) {
			vec2 o = pcssVogel( i, 40.0, phi ) * r;
			float d = pcssCubeDist( shadowMap, bd3D + tu * o.x + tv * o.y, shadowCameraNear, shadowCameraFar );
			lit += d < distC - length( o ) * distR * 0.5 ? 0.0 : 1.0;
		}
		return mix( 1.0, lit / 40.0, shadowIntensity );
	}
`;
function patchShadows(){
  const C=THREE.ShaderChunk;let s=C.shadowmap_pars_fragment;
  const fail=what=>{throw new Error('PCSS shadow patch: '+what+' not found in shadowmap_pars_fragment (three r'+THREE.REVISION+')');};
  // Anchors avoid comments and blank lines: the npm build strips them from shader chunks.
  // 2D maps: rename the BASIC getShadow (found by its depth read), define the PCSS one before getSunShadow (its caller)
  const g=s.lastIndexOf('float getShadow( sampler2D shadowMap,',s.indexOf('float depth = texture2D( shadowMap, shadowCoord.xy ).r;'));
  if(g<0||s.indexOf('float depth = texture2D( shadowMap, shadowCoord.xy ).r;')<0)fail('BASIC getShadow');
  s=s.slice(0,g)+s.slice(g).replace('float getShadow(','float getShadowHard(');
  const sun=s.search(/#if NUM_SUN_LIGHT_SHADOWS > 0\s*float getSunShadow\(/);if(sun<0)fail('getSunShadow');
  s=s.slice(0,sun)+'#if defined( SHADOWMAP_TYPE_BASIC )\n'+HELPERS+'#endif\n'+s.slice(sun);
  // cube maps: rename the BASIC getPointShadow, append the PCSS one at the end of that branch
  const cd=s.indexOf('float depth = textureCube( shadowMap, bd3D ).r;');if(cd<0)fail('BASIC getPointShadow');
  const pg=s.lastIndexOf('float getPointShadow( samplerCube shadowMap,',cd);if(pg<0)fail('BASIC getPointShadow signature');
  s=s.slice(0,pg)+s.slice(pg).replace('float getPointShadow(','float getPointShadowHard(');
  const end=s.search(/#endif\s*#endif\s*#endif\s*$/);if(end<0)fail('end of point shadows');
  s=s.slice(0,end)+POINT+'\n'+s.slice(end);
  C.shadowmap_pars_fragment=s;
}

export {patchShadows};
