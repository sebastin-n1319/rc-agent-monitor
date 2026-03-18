"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.objectToUrlParams = void 0;
function encodeURIComponentWithUndefined(value) {
    return typeof value === 'undefined' ? '' : encodeURIComponent(value);
}
function objectToUrlParams(obj) {
    return Object.keys(obj)
        .map(function (key) {
        if (Array.isArray(obj[key])) {
            return obj[key]
                .map(function (value) { return encodeURIComponent(key) + '=' + encodeURIComponentWithUndefined(value); })
                .join('&');
        }
        return encodeURIComponent(key) + '=' + encodeURIComponentWithUndefined(obj[key]);
    })
        .join('&');
}
exports.objectToUrlParams = objectToUrlParams;
//# sourceMappingURL=utils.js.map