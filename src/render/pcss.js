import * as THREE from 'three';

/* Soft shadows whose blur follows the light source size and the distance between caster and receiver (PCSS).
   Works on BasicShadowMap: shadow maps are plain depth textures (nearest-filtered sampler2D / samplerCube),
   so the blocker search can read raw depths. The BASIC getShadow / getPointShadow are renamed *Hard and
   replaced by PCSS versions with the same signatures.
   shadow.radius carries the per-light size parameter: >0 parallel projection, <0 perspective (far = 10 x near),
   point lights: source size * 100 (world units). Formulas live in updateLights (lights/runtime.js).
   Depth 1.0 is a cleared texel (nothing between the light and its far plane) and never counts as a blocker;
   receivers beyond the far plane are still shadowed by blockers in the map. */
const HELPERS=`
	uniform float pcssSeed; // progressive sample index
	// Kernel rotation (x, turns) and radial jitter (y) for this pixel and sample: a per-pixel random offset (hash, no
	// spatial structure) plus an R2 step per sample, so each pixel's samples spread evenly over rotations and radii.
	// (Interleaved gradient noise re-seeded per sample gave each pixel its own uneven set of rotations, correlated along
	// the noise's diagonals: a fine wavy moire on the floor that averaging never removed.)
	vec2 pcssHash( vec2 p ) { vec3 q = fract( p.xyx * vec3( 0.1031, 0.1030, 0.0973 ) ); q += dot( q, q.yzx + 33.33 ); return fract( ( q.xx + q.yz ) * q.zy ); }
	vec2 pcssNoise() { return fract( pcssHash( gl_FragCoord.xy ) + pcssSeed * vec2( 0.75487767, 0.56984029 ) ); }
	vec2 pcssVogel( int i, float n, vec2 j ) { float r = sqrt( ( float( i ) + j.y ) / n ); float t = float( i ) * 2.39996323 + j.x * 6.2831853; return r * vec2( cos( t ), sin( t ) ); }
	float pcssLin( float z ) { return 10.0 / ( 10.0 - z * 9.0 ); } // view depth / near for far = 10 near; valid for z < 10/9 (beyond far too)
	float pcssShadow( sampler2D smap, vec2 mapSize, float pk, vec2 uv, float z ) {
		vec2 texel = vec2( 1.0 ) / mapSize;
		bool persp = pk < 0.0;
		float k = abs( pk ) / 1000.0;
		vec2 jit = pcssNoise();
		float zr = persp ? pcssLin( z ) : z;
		float b0 = max( 1.0, zr * 0.4 );
		float search = persp ? k * ( zr - b0 ) / ( zr * b0 ) : k * 0.3;
		search = clamp( search, 2.0 * texel.x, 0.12 );
		float sum = 0.0; float cnt = 0.0;
		for ( int i = 0; i < 16; i ++ ) {
			vec2 o = pcssVogel( i, 16.0, jit ) * search;
			float d = texture2D( smap, uv + o ).r;
			float dv = persp ? pcssLin( d ) : d;
			float zt = persp ? zr * ( 1.0 - length( o ) * 0.6 ) : z - length( o ) * 0.35;
			if ( d < 1.0 && dv < zt ) { sum += dv; cnt += 1.0; }
		}
		if ( cnt < 0.5 ) return 1.0;
		float zb = sum / cnt;
		float pen = persp ? k * ( zr - zb ) / ( zr * zb ) : k * ( z - zb );
		float r = clamp( pen, 1.5 * texel.x, 0.15 );
		float lit = 0.0;
		for ( int i = 0; i < 40; i ++ ) {
			vec2 o = pcssVogel( i, 40.0, jit ) * r;
			float d = texture2D( smap, uv + o ).r;
			float dv = persp ? pcssLin( d ) : d;
			float zt = persp ? zr * ( 1.0 - length( o ) * 0.6 ) : z - length( o ) * 0.35;
			lit += d < 1.0 && dv < zt ? 0.0 : 1.0;
		}
		return lit / 40.0;
	}
	float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
		float shadow = 1.0;
		shadowCoord.xyz /= shadowCoord.w;
		shadowCoord.z += shadowBias;
		bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
		if ( inFrustum ) shadow = pcssShadow( shadowMap, shadowMapSize, shadowRadius, shadowCoord.xy, shadowCoord.z );
		return mix( 1.0, shadow, shadowIntensity );
	}
`;
// Cube depth maps store perspective depth along each face's axis; convert a sample back to radial distance.
const POINT=`
	float pcssCubeDist( samplerCube smap, vec3 dir, float near, float far ) {
		vec3 a = abs( dir );
		float axis = max( max( a.x, a.y ), a.z );
		float dp = textureCube( smap, dir ).r;
		if ( dp >= 1.0 ) return 1e10; // cleared texel: nothing within far
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
		vec2 jit = pcssNoise();
		float search = clamp( srcSize * 0.6 / distR, 2.0 * texel, 0.3 );
		float sum = 0.0; float cnt = 0.0;
		for ( int i = 0; i < 16; i ++ ) {
			vec2 o = pcssVogel( i, 16.0, jit ) * search;
			float d = pcssCubeDist( shadowMap, bd3D + tu * o.x + tv * o.y, shadowCameraNear, shadowCameraFar );
			if ( d < distC - length( o ) * distR * 0.5 ) { sum += d; cnt += 1.0; }
		}
		if ( cnt < 0.5 ) return 1.0;
		float distB = max( sum / cnt, 0.0001 );
		float r = clamp( srcSize * ( distR - distB ) / ( distB * distR ), 2.0 * texel, 0.3 );
		float lit = 0.0;
		for ( int i = 0; i < 40; i ++ ) {
			vec2 o = pcssVogel( i, 40.0, jit ) * r;
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
