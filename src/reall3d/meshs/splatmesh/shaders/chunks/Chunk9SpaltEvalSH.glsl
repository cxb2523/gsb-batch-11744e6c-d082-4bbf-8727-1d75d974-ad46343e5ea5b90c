// ==============================================
// Copyright (c) 2025 reall3d.com, MIT license
// ==============================================
/*
* 球谐系数读取计算
*/
const float FactorSH = 0.0625;
const uint MaskSH = 0x1Fu;
const float SH_C1 = 0.4886025119029199;
const float[5] SH_C2 = float[](1.0925484305920792, -1.0925484305920792, 0.31539156525252005, -1.0925484305920792, 0.5462742152960396);
const float[7] SH_C3 = float[](-0.5900435899266435, 2.890611442640554, -0.4570457994644658, 0.3731763325901154, -0.4570457994644658, 1.445305721320277, -0.5900435899266435);

vec3[15] splatReadShDatas() {
    int shCnt = 0;
    float[45] fSHs;
    int fetchX = int(splatIndex & ((splatTextureWidth) - 1u));
    int fetchY = int(splatIndex / splatTextureWidth);
    uvec4 rgb12 = texelFetch(splatShTexture12, ivec2(fetchX, fetchY), 0);
    if (rgb12.a > 0u) {
        shCnt = 3;
        fSHs[0] = float((rgb12.r >> 27) & MaskSH) * FactorSH - 1.0;
        fSHs[1] = float((rgb12.r >> 22) & MaskSH) * FactorSH - 1.0;
        fSHs[2] = float((rgb12.r >> 17) & MaskSH) * FactorSH - 1.0;
        fSHs[3] = float((rgb12.r >> 12) & MaskSH) * FactorSH - 1.0;
        fSHs[4] = float((rgb12.r >> 7) & MaskSH) * FactorSH - 1.0;
        fSHs[5] = float((rgb12.r >> 2) & MaskSH) * FactorSH - 1.0;
        fSHs[6] = float(((rgb12.r << 3) | (rgb12.g >> 29)) & MaskSH) * FactorSH - 1.0;
        fSHs[7] = float((rgb12.g >> 24) & MaskSH) * FactorSH - 1.0;
        fSHs[8] = float((rgb12.g >> 19) & MaskSH) * FactorSH - 1.0;

        if (shDegree > 1) {
            shCnt = 8;
            fSHs[9] = float((rgb12.g >> 14) & MaskSH) * FactorSH - 1.0;
            fSHs[10] = float((rgb12.g >> 9) & MaskSH) * FactorSH - 1.0;
            fSHs[11] = float((rgb12.g >> 4) & MaskSH) * FactorSH - 1.0;
            fSHs[12] = float(((rgb12.g << 1) | (rgb12.b >> 31)) & MaskSH) * FactorSH - 1.0;
            fSHs[13] = float((rgb12.b >> 26) & MaskSH) * FactorSH - 1.0;
            fSHs[14] = float((rgb12.b >> 21) & MaskSH) * FactorSH - 1.0;
            fSHs[15] = float((rgb12.b >> 16) & MaskSH) * FactorSH - 1.0;
            fSHs[16] = float((rgb12.b >> 11) & MaskSH) * FactorSH - 1.0;
            fSHs[17] = float((rgb12.b >> 6) & MaskSH) * FactorSH - 1.0;
            fSHs[18] = float((rgb12.b >> 1) & MaskSH) * FactorSH - 1.0;
            fSHs[19] = float(((rgb12.b << 4) | (rgb12.a >> 28)) & MaskSH) * FactorSH - 1.0;
            fSHs[20] = float(((rgb12.a >> 23) & MaskSH)) * FactorSH - 1.0;
            fSHs[21] = float((rgb12.a >> 18) & MaskSH) * FactorSH - 1.0;
            fSHs[22] = float((rgb12.a >> 13) & MaskSH) * FactorSH - 1.0;
            fSHs[23] = float((rgb12.a >> 8) & MaskSH) * FactorSH - 1.0;

            if (shDegree > 2) {
                uvec4 rgb3 = texelFetch(splatShTexture3, ivec2(fetchX, fetchY), 0);
                if (rgb3.a > 0u) {
                    shCnt = 15;
                    fSHs[24] = float((rgb3.r >> 27) & MaskSH) * FactorSH - 1.0;
                    fSHs[25] = float((rgb3.r >> 22) & MaskSH) * FactorSH - 1.0;
                    fSHs[26] = float((rgb3.r >> 17) & MaskSH) * FactorSH - 1.0;
                    fSHs[27] = float((rgb3.r >> 12) & MaskSH) * FactorSH - 1.0;
                    fSHs[28] = float((rgb3.r >> 7) & MaskSH) * FactorSH - 1.0;
                    fSHs[29] = float((rgb3.r >> 2) & MaskSH) * FactorSH - 1.0;
                    fSHs[30] = float(((rgb3.r << 3) | (rgb3.g >> 29)) & MaskSH) * FactorSH - 1.0;
                    fSHs[31] = float((rgb3.g >> 24) & MaskSH) * FactorSH - 1.0;
                    fSHs[32] = float((rgb3.g >> 19) & MaskSH) * FactorSH - 1.0;
                    fSHs[33] = float((rgb3.g >> 14) & MaskSH) * FactorSH - 1.0;
                    fSHs[34] = float((rgb3.g >> 9) & MaskSH) * FactorSH - 1.0;
                    fSHs[35] = float((rgb3.g >> 4) & MaskSH) * FactorSH - 1.0;
                    fSHs[36] = float(((rgb3.g << 1) | (rgb3.b >> 31)) & MaskSH) * FactorSH - 1.0;
                    fSHs[37] = float((rgb3.b >> 26) & MaskSH) * FactorSH - 1.0;
                    fSHs[38] = float((rgb3.b >> 21) & MaskSH) * FactorSH - 1.0;
                    fSHs[39] = float((rgb3.b >> 16) & MaskSH) * FactorSH - 1.0;
                    fSHs[40] = float((rgb3.b >> 11) & MaskSH) * FactorSH - 1.0;
                    fSHs[41] = float((rgb3.b >> 6) & MaskSH) * FactorSH - 1.0;
                    fSHs[42] = float((rgb3.b >> 1) & MaskSH) * FactorSH - 1.0;
                    fSHs[43] = float(((rgb3.b << 4) | (rgb3.a >> 28)) & MaskSH) * FactorSH - 1.0;
                    fSHs[44] = float((rgb3.a >> 23) & MaskSH) * FactorSH - 1.0;
                }
            }
        }
    }

    vec3[15] sh;
    for (int i = 0; i < 15; ++i) {
        sh[i] = i < shCnt ? vec3(fSHs[i * 3], fSHs[i * 3 + 1], fSHs[i * 3 + 2]) : vec3(0.0);
    }
    return sh;
}

vec3[15] splatReadShByPalettes(uint palettesIdx) {
    vec3[15] coeffs;

    uint row = palettesIdx >> 6u;
    uint col = palettesIdx & 0x3Fu;
    const float invW = 1.0 / 960.0;
    const float invH = 1.0 / 1024.0;

    float v = (float(row) + 0.5) * invH;
    float u0 = (float(col * 15u) + 0.5) * invW;

    for (int i = 0; i < 15; i++) {
        uvec4 texel = texture(shPalettes, vec2(u0 + float(i) * invW, v));
        coeffs[i].r = (float(texel.r) - 128.0) / 128.0;
        coeffs[i].g = (float(texel.g) - 128.0) / 128.0;
        coeffs[i].b = (float(texel.b) - 128.0) / 128.0;
    }

    return coeffs;
}

// https://github.com/graphdeco-inria/gaussian-splatting/blob/main/utils/sh_utils.py
vec3 splatEvalSH(in vec3 v3Cen, uint palettesIdx) {
    vec3 dir = normalize(v3Cen - cameraPosition);
    float x = dir.x;
    float y = dir.y;
    float z = dir.z;

    vec3[15] sh;
    if (shPalettesReady) {
        sh = splatReadShByPalettes(palettesIdx);
    } else {
        sh = splatReadShDatas();
    }
    vec3 result = SH_C1 * (-sh[0] * y + sh[1] * z - sh[2] * x);

    if (shDegree > 1) {
        float xx = x * x;
        float yy = y * y;
        float zz = z * z;
        float xy = x * y;
        float yz = y * z;
        float xz = x * z;

        result += sh[3] * (SH_C2[0] * xy) +
            sh[4] * (SH_C2[1] * yz) +
            sh[5] * (SH_C2[2] * (2.0 * zz - xx - yy)) +
            sh[6] * (SH_C2[3] * xz) +
            sh[7] * (SH_C2[4] * (xx - yy));

        if (shDegree > 2) {
            result += sh[8] * (SH_C3[0] * y * (3.0 * xx - yy)) +
                sh[9] * (SH_C3[1] * xy * z) +
                sh[10] * (SH_C3[2] * y * (4.0 * zz - xx - yy)) +
                sh[11] * (SH_C3[3] * z * (2.0 * zz - 3.0 * xx - 3.0 * yy)) +
                sh[12] * (SH_C3[4] * x * (4.0 * zz - xx - yy)) +
                sh[13] * (SH_C3[5] * z * (xx - yy)) +
                sh[14] * (SH_C3[6] * x * (xx - 3.0 * yy));
        }
    }
    return result;
}
