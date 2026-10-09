import * as THREE from 'three';

/* Soft shadows whose blur follows the light source size and the distance between caster and receiver (PCSS).
   shadow.radius carries the per-light size parameter: >0 parallel projection, <0 perspective (far = 10 x near). */
function patchShadows(){
  const C=THREE.ShaderChunk;let s=C.shadowmap_pars_fragment;
  const helpers=`
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
			float d = unpackRGBAToDepth( texture2D( smap, uv + o ) );
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
			float d = unpackRGBAToDepth( texture2D( smap, uv + o ) );
			float dv = persp ? pcssLin( d ) : d;
			float zt = persp ? zr * ( 1.0 - length( o ) * 0.6 ) : z - length( o ) * 0.35;
			lit += dv < zt ? 0.0 : 1.0;
		}
		return lit / 40.0;
	}
	float getShadow(`;
  s=s.replace('float getShadow(',helpers);
  s=s.replace(/#if defined\( SHADOWMAP_TYPE_PCF \)\n[\s\S]*?\* \( 1\.0 \/ 17\.0 \);/,'#if defined( SHADOWMAP_TYPE_PCF )\n\t\t\tshadow = pcssShadow( shadowMap, shadowMapSize, shadowRadius, shadowCoord.xy, shadowCoord.z );');
  s=s.replace(/vec2 offset = vec2\( - 1, 1 \) \* shadowRadius \* texelSize\.y;[\s\S]*?\) \* \( 1\.0 \/ 9\.0 \);/,`float srcSize = abs( shadowRadius ) / 100.0;
			float range = shadowCameraFar - shadowCameraNear;
			float distR = max( length( lightToPosition ), 0.0001 );
			vec3 upv = abs( bd3D.y ) < 0.99 ? vec3( 0.0, 1.0, 0.0 ) : vec3( 1.0, 0.0, 0.0 );
			vec3 tu = normalize( cross( upv, bd3D ) ); vec3 tv = cross( bd3D, tu );
			float phi = pcssNoise() * 6.2831853;
			float search = clamp( srcSize * 0.6 / distR, 2.0 * texelSize.y, 0.3 );
			float sum = 0.0; float cnt = 0.0;
			for ( int i = 0; i < 16; i ++ ) {
				vec2 o = pcssVogel( i, 16.0, phi ) * search;
				float d = unpackRGBAToDepth( texture2D( shadowMap, cubeToUV( bd3D + tu * o.x + tv * o.y, texelSize.y ) ) );
				if ( d < dp - length( o ) * distR / range * 0.5 ) { sum += d; cnt += 1.0; }
			}
			if ( cnt < 0.5 ) return 1.0;
			float distB = max( shadowCameraNear + ( sum / cnt ) * range, 0.0001 );
			float r = clamp( srcSize * ( distR - distB ) / ( distB * distR ), 2.0 * texelSize.y, 0.3 );
			float lit = 0.0;
			for ( int i = 0; i < 40; i ++ ) {
				vec2 o = pcssVogel( i, 40.0, phi ) * r;
				float d = unpackRGBAToDepth( texture2D( shadowMap, cubeToUV( bd3D + tu * o.x + tv * o.y, texelSize.y ) ) );
				lit += d < dp - length( o ) * distR / range * 0.5 ? 0.0 : 1.0;
			}
			return lit / 40.0;`);
  if(s.indexOf('pcssShadow( shadowMap')<0||s.indexOf('srcSize')<0)console.warn('Shadow patch did not apply');
  C.shadowmap_pars_fragment=s;
}

export {patchShadows};
