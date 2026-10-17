// Dependency-free DSP shared by web and desktop through WebAssembly.
// Build: rustc --edition 2021 --crate-type cdylib --target wasm32-unknown-unknown -O lib.rs -o ../../apps/web/public/darkcut/audio.wasm
#[no_mangle]
pub extern "C" fn alloc(len: usize) -> *mut f32 {
    Box::into_raw(vec![0.0_f32; len].into_boxed_slice()) as *mut f32
}
#[no_mangle]
pub unsafe extern "C" fn release(ptr: *mut f32, len: usize) {
    drop(Box::from_raw(std::ptr::slice_from_raw_parts_mut(ptr, len)));
}

fn detect(samples: &[f32], frames: usize, channels: usize, rate: usize, db: f32, minimum: f32, padding: f32) -> Result<Vec<(f32, f32)>, ()> {
    if frames == 0 || channels == 0 || rate == 0 || samples.len() != frames * channels || !db.is_finite() || !minimum.is_finite() || !padding.is_finite() || !(-80.0..=-10.0).contains(&db) || !(0.025..=20.0).contains(&minimum) || !(0.0..=2.0).contains(&padding) { return Err(()); }
    let window = (rate / 100).max(1); // 10 ms; any active channel preserves speech.
    let threshold = 10_f32.powf(db / 10.0);
    let mut ranges = Vec::new();
    let mut quiet = None;
    let mut audible = false;
    let mut close = |start: usize, end: usize| {
        let duration = (end - start) as f32 / rate as f32;
        let a = start as f32 / rate as f32 + padding;
        let b = end as f32 / rate as f32 - padding;
        if duration >= minimum && b - a >= 0.01 { ranges.push((a, b)); }
    };
    for start in (0..frames).step_by(window) {
        let end = (start + window).min(frames);
        let active = (0..channels).any(|c| {
            let energy: f32 = samples[c*frames+start..c*frames+end].iter().map(|x| if x.is_finite() { x*x } else { 1.0 }).sum();
            energy / (end-start) as f32 >= threshold
        });
        if active { audible = true; if let Some(a) = quiet.take() { close(a, start); } }
        else if quiet.is_none() { quiet = Some(start); }
    }
    if let Some(a) = quiet { close(a, frames); }
    if !audible { return Err(()); }
    Ok(ranges)
}

// Output is at most two floats per 10ms window. Caller allocates 2*(frames/window+1).
#[no_mangle]
pub unsafe extern "C" fn silence(input: *const f32, frames: usize, channels: usize, rate: usize, db: f32, minimum: f32, padding: f32, output: *mut f32) -> i32 {
    let input = std::slice::from_raw_parts(input, frames * channels);
    match detect(input, frames, channels, rate, db, minimum, padding) {
        Err(_) => -1,
        Ok(ranges) => { for (i, (a,b)) in ranges.iter().enumerate() { *output.add(i*2)=*a; *output.add(i*2+1)=*b; } ranges.len() as i32 }
    }
}

// Called after existing editor split commands, in exact timeline ticks.
#[no_mangle]
pub extern "C" fn edit_action(start: f64, duration: f64, a: f64, b: f64) -> i32 {
    if start >= a && start + duration <= b { 1 } // remove
    else if start >= b { 2 } // ripple left
    else { 0 }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn cuts_long_pause_with_padding() {
        let mut s = vec![0.5; 3000]; s[1000..2000].fill(0.0);
        let r=detect(&s,3000,1,1000,-35.0,0.4,0.08).unwrap();
        assert_eq!(r.len(),1); assert!((r[0].0-1.08).abs()<0.001); assert!((r[0].1-1.92).abs()<0.001);
    }
    #[test] fn preserves_short_pause_and_quiet_speech() {
        let mut s=vec![0.05;1000]; s[200..300].fill(0.0);
        assert!(detect(&s,1000,1,1000,-35.0,0.4,0.08).unwrap().is_empty());
    }
    #[test] fn stereo_does_not_cancel_opposite_phase() {
        let mut s=vec![0.5;1000]; s.extend(vec![-0.5;1000]);
        assert!(detect(&s,1000,2,1000,-35.0,0.4,0.08).unwrap().is_empty());
    }
    #[test] fn silent_recording_is_not_deleted() { assert!(detect(&vec![0.0;1000],1000,1,1000,-35.0,0.4,0.08).is_err()); }
    #[test] fn trim_edges_and_ripple_boundaries() {
        let mut s=vec![0.0;3000];s[1000..2000].fill(0.5);
        assert_eq!(detect(&s,3000,1,1000,-35.0,0.4,0.08).unwrap().len(),2);
        assert_eq!(edit_action(10.0,10.0,10.0,20.0),1);
        assert_eq!(edit_action(20.0,5.0,10.0,20.0),2);
        assert_eq!(edit_action(0.0,10.0,10.0,20.0),0);
    }
}

#[no_mangle]
pub extern "C" fn shifted_time(time: f64, a: f64, b: f64) -> f64 {
    if time <= a { time } else if time < b { a } else { time - (b-a) }
}

#[no_mangle]
pub unsafe extern "C" fn peak_gain(input:*const f32,len:usize)->f32 {
    let peak=std::slice::from_raw_parts(input,len).iter().filter(|x|x.is_finite()).fold(0.0_f32,|a,b|a.max(b.abs()));
    if peak<=0.000001 {0.0} else {(-1.0-20.0*peak.log10()).clamp(-60.0,24.0)}
}
#[no_mangle]
pub extern "C" fn loop_duration(index:usize,source:f64,total:f64)->f64 {
    if source<=0.0 || total<=0.0 {0.0} else {(total-index as f64*source).min(source).max(0.0)}
}
#[no_mangle]
pub unsafe extern "C" fn music_envelope(voices:*const f32,count:usize,duration:f32,base:f32,duck:f32,fade:f32,output:*mut f32)->usize {
    let v=std::slice::from_raw_parts(voices,count*2);
    let fade=fade.max(0.01).min(duration/2.0);
    let mut times=vec![0.0,fade,(duration-fade).max(0.0),duration];
    for i in 0..count {for t in [v[i*2]-0.12,v[i*2],v[i*2+1],v[i*2+1]+0.3] {times.push(t.clamp(0.0,duration));}}
    times.sort_by(|a,b|a.total_cmp(b));times.dedup();
    for (j,t) in times.iter().enumerate(){
        let mut gain=base;
        for i in 0..count {
            let a=v[i*2];let b=v[i*2+1];
            let level=if *t<a-0.12 || *t>b+0.3 {base} else if *t<a {base+(duck-base)*(*t-a+0.12)/0.12} else if *t<=b {duck} else {duck+(base-duck)*(*t-b)/0.3};
            gain=gain.min(level);
        }
        let edge=(*t/fade).min((duration-*t)/fade).clamp(0.0,1.0);
        gain=gain.min(-60.0+(base+60.0)*edge);
        *output.add(j*2)=*t;*output.add(j*2+1)=gain;
    }
    times.len()
}

#[cfg(test)]
mod mix_tests {
 use super::*;
 #[test] fn normalized_peak_and_silent_audio(){unsafe{assert!((peak_gain([0.5_f32].as_ptr(),1)-5.0206).abs()<0.001);assert_eq!(peak_gain([0.0_f32].as_ptr(),1),0.0);}}
 #[test] fn loop_clips_last_segment(){assert_eq!(loop_duration(2,3.0,8.0),2.0);assert_eq!(loop_duration(3,3.0,8.0),0.0);}
 #[test] fn ducking_and_fades(){unsafe{let mut out=[0.0;16];let n=music_envelope([1.0,2.0].as_ptr(),1,3.0,-18.0,-30.0,0.2,out.as_mut_ptr());let points=&out[..n*2];assert_eq!(points[1],-60.0);assert_eq!(points[points.len()-1],-60.0);assert!(points.chunks(2).any(|p|p[0]==1.0&&p[1]==-30.0));}}
}
