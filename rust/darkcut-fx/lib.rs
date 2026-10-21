// Transition envelopes composed with the existing camera animation.
fn smooth(x: f64) -> f64 { let x=x.clamp(0.0,1.0); x*x*(3.0-2.0*x) }
#[no_mangle]
pub extern "C" fn transition_value(preset: u32, channel: u32, time: f64, duration: f64, base: f64) -> f64 {
    let duration=duration.max(0.001);
    let edge=(duration*0.16).clamp(0.15,0.55).min(duration/2.0);
    let enter=1.0-smooth(time/edge);
    let exit=smooth((time-(duration-edge))/edge);
    match channel {
        0 => base * (1.0-enter) * (1.0-exit), // opacity
        1 => base + match preset { 2 => 160.0*(enter-exit), 3 => -160.0*(enter-exit), _ => 0.0 },
        2 => base * match preset {
            1 => 1.0+0.08*enter+0.03*exit,
            4 => 1.0+0.1*smooth(time/duration),
            5 => 1.0-0.08*enter-0.03*exit,
            _ => 1.0,
        },
        _ => base,
    }
}
#[cfg(test)] mod tests {
    use super::*;
    #[test] fn six_presets_have_distinct_signatures() {
        let signatures: Vec<_>=(0..6).map(|p| [transition_value(p,1,0.1,4.0,20.0),transition_value(p,2,0.1,4.0,1.2)]).collect();
        for i in 0..6 { for j in i+1..6 { assert_ne!(signatures[i],signatures[j]); } }
    }
    #[test] fn slide_directions_are_opposite() { assert!(transition_value(2,1,0.0,4.0,0.0)>0.0);assert!(transition_value(3,1,0.0,4.0,0.0)<0.0); }
    #[test] fn zoom_and_pop_are_opposite() { assert!(transition_value(1,2,0.0,4.0,1.0)>1.0);assert!(transition_value(5,2,0.0,4.0,1.0)<1.0); }
    #[test] fn camera_is_preserved_between_edges() { for p in [0,1,2,3,5] { assert_eq!(transition_value(p,1,2.0,4.0,42.0),42.0);assert_eq!(transition_value(p,2,2.0,4.0,1.3),1.3); } }
    #[test] fn opacity_and_short_clips() { for d in [0.01,0.1,1.0,7.0] {for p in 0..6 {assert_eq!(transition_value(p,0,0.0,d,0.7),0.0);assert_eq!(transition_value(p,0,d,d,0.7),0.0);assert_eq!(transition_value(p,0,d/2.0,d,0.7),0.7);}} }
}
