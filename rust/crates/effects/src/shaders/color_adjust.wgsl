struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) tex_coord: vec2f,
}

struct EffectUniforms {
    resolution: vec2f,
    direction: vec2f,
    scalars: vec4f,
}

@group(0) @binding(0) var input_texture: texture_2d<f32>;
@group(0) @binding(1) var input_sampler: sampler;
@group(1) @binding(0) var<uniform> uniforms: EffectUniforms;

@fragment
fn fragment_main(input: VertexOutput) -> @location(0) vec4f {
    let original = textureSample(input_texture, input_sampler, input.tex_coord);
    let brightness = uniforms.scalars.x;
    let contrast = uniforms.scalars.y;
    let saturation = uniforms.scalars.z;
    let temperature = uniforms.scalars.w;
    let luma = dot(original.rgb, vec3f(0.2126, 0.7152, 0.0722));
    var rgb = mix(vec3f(luma), original.rgb, saturation);
    rgb = (rgb - vec3f(0.5)) * contrast + vec3f(0.5);
    rgb += vec3f(brightness + temperature * 0.13, brightness, brightness - temperature * 0.13);
    return vec4f(clamp(rgb, vec3f(0.0), vec3f(1.0)), original.a);
}
