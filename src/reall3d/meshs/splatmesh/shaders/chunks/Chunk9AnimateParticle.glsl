// ==============================================
// Copyright (c) 2025 reall3d.com, MIT license
// ==============================================
/*
* 粒子加载效果
*/
vec3 animateParticle(vec3 v3Cen) {
    if (particleMode < 1)
        return v3Cen;
    float factor = particleMode > 1 ? ((performanceAct - performanceNow) / 5000.0) : ((performanceNow - performanceAct) / 5000.0);
    float radius = particleMode > 1 ? (max(currentVisibleRadius, maxRadius) * 0.6 * min((performanceNow) / 3000.0, 1.0)) : (max(currentVisibleRadius, maxRadius) * 0.6 * min((performanceNow - performanceAct) / 3000.0, 1.0));
    if (factor <= 0.0)
        return v3Cen;

    // 随机种子（均匀分布）
    vec3 randSeed = fract(sin(vec3(dot(v3Cen, vec3(12.9898, 78.233, 37.719)), dot(v3Cen.yzx, vec3(49.123, 23.456, 87.654)), dot(v3Cen.zxy, vec3(34.567, 91.234, 56.789))))) * 2.0 - 1.0;

    // 动态相位计算（增加随机性）
    float phase = factor * 12.0 + v3Cen.y * (15.0 + randSeed.x * 3.0) + v3Cen.z * (13.0 + randSeed.y * 2.0);

    // 混合波形计算（增加复杂性）
    float wave1 = sin(phase * (2.0 + randSeed.y * 1.5 + randSeed.z * 1.5));
    float wave2 = cos(phase * (1.2 + randSeed.x * 0.3) + v3Cen.x * 20.0);
    float dynamicFactor = mix(wave1, wave2, 0.5 + randSeed.z * 0.2) * 0.5 + 0.5;

    // 均匀的运动幅度（不再依赖距离）
    float amplitude = radius * 0.25 * factor * (0.9 + randSeed.z * 0.2);

    // 位移应用（三轴都有适度运动）
    vec3 offset = vec3(amplitude * (dynamicFactor * 2.0 - 1.0), amplitude * randSeed.x * 5.0, amplitude * randSeed.y * 2.5);

    // 物理碰撞系统（保持反弹效果）
    vec3 newPos = v3Cen + offset;
    float newDist = length(newPos);
    if (newDist > radius) {
        vec3 dir = normalize(newPos);
        float penetration = newDist - radius;
        float elasticity = 0.7 + randSeed.z * 0.2;

        // 反弹（带切向扰动）
        vec3 bounceVec = dir * penetration * elasticity;
        vec3 tangent = normalize(cross(dir, vec3(randSeed.x, randSeed.y, 1.0)));
        newPos -= bounceVec - tangent * (length(randSeed.xy) * penetration * 0.2);
    }

    // 最终约束（确保严格在球体内）
    return normalize(newPos) * min(length(newPos), radius);
}
