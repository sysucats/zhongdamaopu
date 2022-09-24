module.exports = (function() {
var __MODS__ = {};
var __DEFINE__ = function(modId, func, req) { var m = { exports: {}, _tempexports: {} }; __MODS__[modId] = { status: 0, func: func, req: req, m: m }; };
var __REQUIRE__ = function(modId, source) { if(!__MODS__[modId]) return require(source); if(!__MODS__[modId].status) { var m = __MODS__[modId].m; m._exports = m._tempexports; var desp = Object.getOwnPropertyDescriptor(m, "exports"); if (desp && desp.configurable) Object.defineProperty(m, "exports", { set: function (val) { if(typeof val === "object" && val !== m._exports) { m._exports.__proto__ = val.__proto__; Object.keys(val).forEach(function (k) { m._exports[k] = val[k]; }); } m._tempexports = val }, get: function () { return m._tempexports; } }); __MODS__[modId].status = 1; __MODS__[modId].func(__MODS__[modId].req, m, m.exports); } return __MODS__[modId].m.exports; };
var __REQUIRE_WILDCARD__ = function(obj) { if(obj && obj.__esModule) { return obj; } else { var newObj = {}; if(obj != null) { for(var k in obj) { if (Object.prototype.hasOwnProperty.call(obj, k)) newObj[k] = obj[k]; } } newObj.default = obj; return newObj; } };
var __REQUIRE_DEFAULT__ = function(obj) { return obj && obj.__esModule ? obj.default : obj; };
__DEFINE__(1662121424059, function(require, module, exports) {

Object.defineProperty(exports, "__esModule", { value: true });
const Geo = require("./geo/index");
const collection_1 = require("./collection");
const command_1 = require("./command");
const index_1 = require("./serverDate/index");
const index_2 = require("./regexp/index");
const bson_1 = require("bson");
var query_1 = require("./query");
exports.Query = query_1.Query;
var collection_2 = require("./collection");
exports.CollectionReference = collection_2.CollectionReference;
var document_1 = require("./document");
exports.DocumentReference = document_1.DocumentReference;
/**
 * 数据库模块
 *
 */
class Db {
    constructor(config) {
        var _a;
        /**
         * Geo 类型
         */
        this.Geo = Geo;
        /**
         * 逻辑操作的命令
         */
        this.command = command_1.Command;
        /**
         * This method was deprecated, use js native `new RegExp()` instead
         * @deprecated
         */
        this.RegExp = index_2.RegExpConstructor;
        /**
         * This method is deprecated, not implemented in server side
         * @deprecated
         */
        this.serverDate = index_1.ServerDateConstructor;
        if (!config.request) {
            throw new Error('DbConfig.request cannot be empty');
        }
        this.request = config.request;
        this.primaryKey = (_a = config.primaryKey) !== null && _a !== void 0 ? _a : '_id';
    }
    /**
     * 获取集合的引用
     *
     * @param collName - 集合名称
     */
    collection(collName) {
        if (!collName) {
            throw new Error('Collection name is required');
        }
        return new collection_1.CollectionReference(this, collName);
    }
    /**
     * Generate a hex string id for document
     * @returns
     */
    generateId() {
        const id = new bson_1.ObjectId();
        return id.toHexString();
    }
    /**
     * Wrapper for ObjectId() of mongodb
     * @param params
     * @returns
     */
    ObjectId(id) {
        return new bson_1.ObjectId(id);
    }
}
exports.Db = Db;

}, function(modId) {var map = {"./geo/index":1662121424060,"./collection":1662121424074,"./command":1662121424087,"./serverDate/index":1662121424065,"./regexp/index":1662121424088,"./query":1662121424078,"./document":1662121424075}; return __REQUIRE__(map[modId], modId); })
__DEFINE__(1662121424060, function(require, module, exports) {

function __export(m) {
    for (var p in m) if (!exports.hasOwnProperty(p)) exports[p] = m[p];
}
Object.defineProperty(exports, "__esModule", { value: true });
__export(require("./point"));
__export(require("./lineString"));
__export(require("./polygon"));
__export(require("./multiPoint"));
__export(require("./multiLineString"));
__export(require("./multiPolygon"));

}, function(modId) { var map = {"./point":1662121424061,"./lineString":1662121424069,"./polygon":1662121424070,"./multiPoint":1662121424071,"./multiLineString":1662121424072,"./multiPolygon":1662121424073}; return __REQUIRE__(map[modId], modId); })
__DEFINE__(1662121424061, function(require, module, exports) {

Object.defineProperty(exports, "__esModule", { value: true });
const validate_1 = require("../validate");
const symbol_1 = require("../helper/symbol");
const type_1 = require("../utils/type");
/**
 * 地址位置
 *
 * @author haroldhu
 */
class Point {
    /**
     * 初始化
     *
     * @param latitude    - 纬度 [-90, 90]
     * @param longitude   - 经度 [-180, 180]
     */
    constructor(longitude, latitude) {
        validate_1.Validate.isGeopoint('longitude', longitude);
        validate_1.Validate.isGeopoint('latitude', latitude);
        this.longitude = longitude;
        this.latitude = latitude;
    }
    parse(key) {
        return {
            [key]: {
                type: 'Point',
                coordinates: [this.longitude, this.latitude]
            }
        };
    }
    toJSON() {
        return {
            type: 'Point',
            coordinates: [
                this.longitude,
                this.latitude,
            ],
        };
    }
    toReadableString() {
        return `[${this.longitude},${this.latitude}]`;
    }
    static validate(point) {
        return point.type === 'Point' &&
            type_1.isArray(point.coordinates) &&
            validate_1.Validate.isGeopoint('longitude', point.coordinates[0]) &&
            validate_1.Validate.isGeopoint('latitude', point.coordinates[1]);
    }
    get _internalType() {
        return symbol_1.SYMBOL_GEO_POINT;
    }
}
exports.Point = Point;

}, function(modId) { var map = {"../validate":1662121424062,"../helper/symbol":1662121424066,"../utils/type":1662121424068}; return __REQUIRE__(map[modId], modId); })
__DEFINE__(1662121424062, function(require, module, exports) {

Object.defineProperty(exports, "__esModule", { value: true });
const constant_1 = require("./constant");
const util_1 = require("./util");
const type_1 = require("./utils/type");
/**
 * 校验模块
 *
 * @author haroldhu
 * @internal
 */
class Validate {
    /**
    *
    * @static
    * @param {StageName:{}|string} stage
    * @returns {Boolean}
    * @memberof Validate
    */
    static isValidAggregation(stage) {
        if (Object.keys(stage).length !== 1) {
            throw new Error('aggregation stage must have one key');
        }
        return true;
    }
    /**
     * 检测地址位置的点
     *
     * @param point   - 经纬度
     * @param degree  - 数值
     */
    static isGeopoint(point, degree) {
        if (util_1.Util.whichType(degree) !== constant_1.FieldType.Number) {
            throw new Error('Geo Point must be number type');
        }
        // 位置的绝对值
        const degreeAbs = Math.abs(degree);
        if (point === 'latitude' && degreeAbs > 90) {
            throw new Error('latitude should be a number ranges from -90 to 90');
        }
        else if (point === 'longitude' && degreeAbs > 180) {
            throw new Error('longitude should be a number ranges from -180 to 180');
        }
        return true;
    }
    /**
     * 参数是否为整数
     *
     * @param param - 要验证的参数名
     * @param num   - 要验证的参数值
     */
    static isInteger(param, num) {
        if (!Number.isInteger(num)) {
            throw new Error(param + constant_1.ErrorCode.IntegerError);
        }
        return true;
    }
    static isProjection(param, value) {
        // 遍历value 的 属性值， 只有1，0，ProjectionOperator 三种类型
        if (type_1.getType(value) !== 'object') {
            throw new Error(`${param} projection must be an object`);
        }
        for (const key in value) {
            const subValue = value[key];
            if (type_1.getType(subValue) === 'number') {
                if (subValue !== 0 && subValue !== 1) {
                    throw new Error('if the value in projection is of number, it must be 0 or 1');
                }
            }
            else if (type_1.getType(subValue) === 'object') {
            }
            else {
                throw new Error('invalid projection');
            }
        }
        return true;
    }
    static isOrder(param, value) {
        if (type_1.getType(value) !== 'object') {
            throw new Error(`${param} order must be an object`);
        }
        for (let key in value) {
            const subValue = value[key];
            if (subValue !== 1 && subValue !== -1) {
                throw new Error(`order value must be 1 or -1`);
            }
        }
        return true;
    }
    /**
     * 是否为合法的排序字符
     *
     * @param direction
     */
    static isFieldOrder(direction) {
        if (constant_1.OrderDirectionList.indexOf(direction) === -1) {
            throw new Error(constant_1.ErrorCode.DirectionError);
        }
        return true;
    }
    /**
     * 是否为合法的字段地址
     *
     * 只能是连续字段名+英文点号
     *
     * @param path
     */
    static isFieldPath(path) {
        if (!/^[a-zA-Z0-9-_\.]/.test(path)) {
            throw new Error();
        }
        return true;
    }
    /**
     * 是否为合法操作符
     *
     * @param op
     */
    static isOperator(op) {
        if (constant_1.WhereFilterOpList.indexOf(op) === -1) {
            throw new Error(constant_1.ErrorCode.OpStrError);
        }
        return true;
    }
    /**
     * 集合名称是否正确
     *
     * 只能以数字字母开头
     * 可以包含字母数字、减号、下划线
     * 最大长度32位
     *
     * @param name
     */
    static isCollName(name) {
        if (!/^[a-zA-Z0-9]([a-zA-Z0-9-_]){1,32}$/.test(name)) {
            throw new Error(constant_1.ErrorCode.CollNameError);
        }
        return true;
    }
}
exports.Validate = Validate;

}, function(modId) { var map = {"./constant":1662121424063,"./util":1662121424064,"./utils/type":1662121424068}; return __REQUIRE__(map[modId], modId); })
__DEFINE__(1662121424063, function(require, module, exports) {

/**
 * 常量模块
 *
 * @author haroldhu
 */
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * 错误码
 */
var ErrorCode;
(function (ErrorCode) {
    ErrorCode["DocIDError"] = "\u6587\u6863ID\u4E0D\u5408\u6CD5";
    ErrorCode["CollNameError"] = "\u96C6\u5408\u540D\u79F0\u4E0D\u5408\u6CD5";
    ErrorCode["OpStrError"] = "\u64CD\u4F5C\u7B26\u4E0D\u5408\u6CD5";
    ErrorCode["DirectionError"] = "\u6392\u5E8F\u5B57\u7B26\u4E0D\u5408\u6CD5";
    ErrorCode["IntegerError"] = "must be integer";
    ErrorCode["QueryParamTypeError"] = "\u67E5\u8BE2\u53C2\u6570\u5FC5\u987B\u4E3A\u5BF9\u8C61";
    ErrorCode["QueryParamValueError"] = "\u67E5\u8BE2\u53C2\u6570\u5BF9\u8C61\u503C\u4E0D\u80FD\u5747\u4E3Aundefined";
})(ErrorCode || (ErrorCode = {}));
exports.ErrorCode = ErrorCode;
/**
 * 字段类型
 */
const FieldType = {
    String: 'String',
    Number: 'Number',
    Object: 'Object',
    Array: 'Array',
    Boolean: 'Boolean',
    Null: 'Null',
    GeoPoint: 'GeoPoint',
    GeoLineString: 'GeoLineString',
    GeoPolygon: 'GeoPolygon',
    GeoMultiPoint: 'GeoMultiPoint',
    GeoMultiLineString: 'GeoMultiLineString',
    GeoMultiPolygon: 'GeoMultiPolygon',
    Timestamp: 'Date',
    Command: 'Command',
    ServerDate: 'ServerDate',
    BsonDate: 'BsonDate',
    ObjectId: 'ObjectId',
    Binary: 'Binary'
};
exports.FieldType = FieldType;
/**
 * 排序方向列表
 */
const OrderDirectionList = ['desc', 'asc'];
exports.OrderDirectionList = OrderDirectionList;
/**
 * 操作符列表
 */
const WhereFilterOpList = ['<', '<=', '==', '>=', '>'];
exports.WhereFilterOpList = WhereFilterOpList;
/**
 * 操作符别名
 */
var Operator;
(function (Operator) {
    Operator["lt"] = "<";
    Operator["gt"] = ">";
    Operator["lte"] = "<=";
    Operator["gte"] = ">=";
    Operator["eq"] = "==";
})(Operator || (Operator = {}));
exports.Operator = Operator;
/**
 * 操作符映射
 * SDK => MongoDB
 */
const OperatorMap = {
    [Operator.eq]: '$eq',
    [Operator.lt]: '$lt',
    [Operator.lte]: '$lte',
    [Operator.gt]: '$gt',
    [Operator.gte]: '$gte'
};
exports.OperatorMap = OperatorMap;
const UpdateOperatorList = [
    '$set',
    '$inc',
    '$mul',
    '$unset',
    '$push',
    '$pop',
    '$unshift',
    '$shift',
    '$currentDate',
    '$each',
    '$position'
];
exports.UpdateOperatorList = UpdateOperatorList;
var ActionType;
(function (ActionType) {
    ActionType["add"] = "database.addDocument";
    ActionType["query"] = "database.queryDocument";
    ActionType["update"] = "database.updateDocument";
    ActionType["count"] = "database.countDocument";
    ActionType["remove"] = "database.deleteDocument";
    ActionType["aggregate"] = "database.aggregateDocuments";
})(ActionType || (ActionType = {}));
exports.ActionType = ActionType;

}, function(modId) { var map = {}; return __REQUIRE__(map[modId], modId); })
__DEFINE__(1662121424064, function(require, module, exports) {

Object.defineProperty(exports, "__esModule", { value: true });
const bson_1 = require("bson");
const constant_1 = require("./constant");
const index_1 = require("./geo/index");
const index_2 = require("./serverDate/index");
/**
 * 工具模块
 *
 */
class Util {
}
exports.Util = Util;
/**
 * 格式化后端返回的文档数据
 *
 * @param document - 后端文档数据
 */
Util.formatResDocumentData = (documents) => {
    return documents.map(document => {
        return Util.formatField(document);
    });
};
/**
 * 格式化字段
 *
 * 主要是递归数组和对象，把地理位置和日期时间转换为js对象。
 *
 * @param document
 * @internal
 */
Util.formatField = document => {
    const keys = Object.keys(document);
    let protoField = {};
    // 数组递归的情况
    if (Array.isArray(document)) {
        protoField = [];
    }
    keys.forEach(key => {
        const item = document[key];
        const type = Util.whichType(item);
        let realValue;
        switch (type) {
            case constant_1.FieldType.GeoPoint:
                realValue = new index_1.Point(item.coordinates[0], item.coordinates[1]);
                break;
            case constant_1.FieldType.GeoLineString:
                realValue = new index_1.LineString(item.coordinates.map(point => new index_1.Point(point[0], point[1])));
                break;
            case constant_1.FieldType.GeoPolygon:
                realValue = new index_1.Polygon(item.coordinates.map(line => new index_1.LineString(line.map(([lng, lat]) => new index_1.Point(lng, lat)))));
                break;
            case constant_1.FieldType.GeoMultiPoint:
                realValue = new index_1.MultiPoint(item.coordinates.map(point => new index_1.Point(point[0], point[1])));
                break;
            case constant_1.FieldType.GeoMultiLineString:
                realValue = new index_1.MultiLineString(item.coordinates.map(line => new index_1.LineString(line.map(([lng, lat]) => new index_1.Point(lng, lat)))));
                break;
            case constant_1.FieldType.GeoMultiPolygon:
                realValue = new index_1.MultiPolygon(item.coordinates.map(polygon => new index_1.Polygon(polygon.map(line => new index_1.LineString(line.map(([lng, lat]) => new index_1.Point(lng, lat)))))));
                break;
            case constant_1.FieldType.Timestamp:
                realValue = new Date(item.$timestamp * 1000);
                break;
            case constant_1.FieldType.Object:
            case constant_1.FieldType.Array:
                realValue = Util.formatField(item);
                break;
            case constant_1.FieldType.ServerDate:
                realValue = new Date(item.$date);
                break;
            case constant_1.FieldType.ObjectId:
                realValue = bson_1.EJSON.deserialize(item);
                break;
            case constant_1.FieldType.Binary:
                realValue = bson_1.EJSON.deserialize(item);
                break;
            default:
                realValue = item;
        }
        if (Array.isArray(protoField)) {
            protoField.push(realValue);
        }
        else {
            protoField[key] = realValue;
        }
    });
    return protoField;
};
/**
 * 查看数据类型
 *
 * @param obj
 */
Util.whichType = (obj) => {
    let type = Object.prototype.toString.call(obj).slice(8, -1);
    if (type === constant_1.FieldType.Timestamp) {
        return constant_1.FieldType.BsonDate;
    }
    if (type === constant_1.FieldType.Object) {
        if (obj instanceof index_1.Point) {
            return constant_1.FieldType.GeoPoint;
        }
        else if (obj instanceof Date) {
            return constant_1.FieldType.Timestamp;
        } /* else if (obj instanceof Command) {
          return FieldType.Command;
        } */
        else if (obj instanceof index_2.ServerDate) {
            return constant_1.FieldType.ServerDate;
        }
        else if (obj instanceof bson_1.ObjectId) {
            return constant_1.FieldType.ObjectId;
        }
        else if (obj instanceof bson_1.Binary) {
            return constant_1.FieldType.Binary;
        }
        if (obj.$timestamp) {
            type = constant_1.FieldType.Timestamp;
        }
        else if (obj.$date) {
            type = constant_1.FieldType.ServerDate;
        }
        else if (index_1.Point.validate(obj)) {
            type = constant_1.FieldType.GeoPoint;
        }
        else if (index_1.LineString.validate(obj)) {
            type = constant_1.FieldType.GeoLineString;
        }
        else if (index_1.Polygon.validate(obj)) {
            type = constant_1.FieldType.GeoPolygon;
        }
        else if (index_1.MultiPoint.validate(obj)) {
            type = constant_1.FieldType.GeoMultiPoint;
        }
        else if (index_1.MultiLineString.validate(obj)) {
            type = constant_1.FieldType.GeoMultiLineString;
        }
        else if (index_1.MultiPolygon.validate(obj)) {
            type = constant_1.FieldType.GeoMultiPolygon;
        }
        else if (obj.$oid) {
            type = constant_1.FieldType.ObjectId;
        }
        else if (obj.$binary) {
            type = constant_1.FieldType.Binary;
        }
    }
    return type;
};

}, function(modId) { var map = {"./constant":1662121424063,"./geo/index":1662121424060,"./serverDate/index":1662121424065}; return __REQUIRE__(map[modId], modId); })
__DEFINE__(1662121424065, function(require, module, exports) {

Object.defineProperty(exports, "__esModule", { value: true });
const symbol_1 = require("../helper/symbol");
class ServerDate {
    constructor({ offset = 0 } = {}) {
        this.offset = offset;
    }
    get _internalType() {
        return symbol_1.SYMBOL_SERVER_DATE;
    }
    parse() {
        return {
            $date: {
                offset: this.offset
            }
        };
    }
}
exports.ServerDate = ServerDate;
/**
 * @deprecated This method is deprecated, not implemented in server side
 * @param opt
 * @returns
 */
function ServerDateConstructor(opt) {
    return new ServerDate(opt);
}
exports.ServerDateConstructor = ServerDateConstructor;

}, function(modId) { var map = {"../helper/symbol":1662121424066}; return __REQUIRE__(map[modId], modId); })
__DEFINE__(1662121424066, function(require, module, exports) {

function __export(m) {
    for (var p in m) if (!exports.hasOwnProperty(p)) exports[p] = m[p];
}
Object.defineProperty(exports, "__esModule", { value: true });
const symbol_1 = require("../utils/symbol");
__export(require("../utils/symbol"));
exports.SYMBOL_UNSET_FIELD_NAME = symbol_1.default.for('UNSET_FIELD_NAME');
exports.SYMBOL_UPDATE_COMMAND = symbol_1.default.for('UPDATE_COMMAND');
exports.SYMBOL_QUERY_COMMAND = symbol_1.default.for('QUERY_COMMAND');
exports.SYMBOL_LOGIC_COMMAND = symbol_1.default.for('LOGIC_COMMAND');
exports.SYMBOL_GEO_POINT = symbol_1.default.for('GEO_POINT');
exports.SYMBOL_GEO_LINE_STRING = symbol_1.default.for('SYMBOL_GEO_LINE_STRING');
exports.SYMBOL_GEO_POLYGON = symbol_1.default.for('SYMBOL_GEO_POLYGON');
exports.SYMBOL_GEO_MULTI_POINT = symbol_1.default.for('SYMBOL_GEO_MULTI_POINT');
exports.SYMBOL_GEO_MULTI_LINE_STRING = symbol_1.default.for('SYMBOL_GEO_MULTI_LINE_STRING');
exports.SYMBOL_GEO_MULTI_POLYGON = symbol_1.default.for('SYMBOL_GEO_MULTI_POLYGON');
exports.SYMBOL_SERVER_DATE = symbol_1.default.for('SERVER_DATE');
exports.SYMBOL_REGEXP = symbol_1.default.for('REGEXP');

}, function(modId) { var map = {"../utils/symbol":1662121424067}; return __REQUIRE__(map[modId], modId); })
__DEFINE__(1662121424067, function(require, module, exports) {

Object.defineProperty(exports, "__esModule", { value: true });
const _symbols = [];
const __internalMark__ = {};
class HiddenSymbol {
    constructor(target) {
        Object.defineProperties(this, {
            target: {
                enumerable: false,
                writable: false,
                configurable: false,
                value: target,
            },
        });
    }
}
class InternalSymbol extends HiddenSymbol {
    constructor(target, __mark__) {
        if (__mark__ !== __internalMark__) {
            throw new TypeError('InternalSymbol cannot be constructed with new operator');
        }
        super(target);
    }
    static for(target) {
        for (let i = 0, len = _symbols.length; i < len; i++) {
            if (_symbols[i].target === target) {
                return _symbols[i].instance;
            }
        }
        const symbol = new InternalSymbol(target, __internalMark__);
        _symbols.push({
            target,
            instance: symbol,
        });
        return symbol;
    }
}
exports.InternalSymbol = InternalSymbol;
exports.default = InternalSymbol;

}, function(modId) { var map = {}; return __REQUIRE__(map[modId], modId); })
__DEFINE__(1662121424068, function(require, module, exports) {

Object.defineProperty(exports, "__esModule", { value: true });
const symbol_1 = require("./symbol");
exports.getType = (x) => Object.prototype.toString.call(x).slice(8, -1).toLowerCase();
exports.isObject = (x) => exports.getType(x) === 'object';
exports.isString = (x) => exports.getType(x) === 'string';
exports.isNumber = (x) => exports.getType(x) === 'number';
exports.isPromise = (x) => exports.getType(x) === 'promise';
exports.isFunction = (x) => typeof x === 'function';
exports.isArray = (x) => Array.isArray(x);
exports.isDate = (x) => exports.getType(x) === 'date';
exports.isRegExp = (x) => exports.getType(x) === 'regexp';
/**
 * Internal Object can be:  `LogicCommand` | `QueryCommand` | `UpdateCommand`
 * @param x
 * @returns
 */
exports.isInternalObject = (x) => x && (x._internalType instanceof symbol_1.InternalSymbol);
exports.isPlainObject = (obj) => {
    if (typeof obj !== 'object' || obj === null)
        return false;
    let proto = obj;
    while (Object.getPrototypeOf(proto) !== null) {
        proto = Object.getPrototypeOf(proto);
    }
    return Object.getPrototypeOf(obj) === proto;
};
exports.isObjectId = (x) => {
    return (x === null || x === void 0 ? void 0 : x._bsontype) === 'ObjectID';
};
exports.isBinary = (x) => {
    return (x === null || x === void 0 ? void 0 : x._bsontype) === 'Binary';
};

}, function(modId) { var map = {"./symbol":1662121424067}; return __REQUIRE__(map[modId], modId); })
__DEFINE__(1662121424069, function(require, module, exports) {

Object.defineProperty(exports, "__esModule", { value: true });
const symbol_1 = require("../helper/symbol");
const point_1 = require("./point");
const type_1 = require("../utils/type");
/**
 * 线段
 *
 * @author starkewang
 */
class LineString {
    /**
     * 初始化
     *
     * @param points    - GeoPoint
     */
    constructor(points) {
        if (!type_1.isArray(points)) {
            throw new TypeError(`"points" must be of type Point[]. Received type ${typeof points}`);
        }
        if (points.length < 2) {
            throw new Error('"points" must contain 2 points at least');
        }
        points.forEach(point => {
            if (!(point instanceof point_1.Point)) {
                throw new TypeError(`"points" must be of type Point[]. Received type ${typeof point}[]`);
            }
        });
        this.points = points;
    }
    parse(key) {
        return {
            [key]: {
                type: 'LineString',
                coordinates: this.points.map(point => point.toJSON().coordinates)
            }
        };
    }
    toJSON() {
        return {
            type: 'LineString',
            coordinates: this.points.map(point => point.toJSON().coordinates)
        };
    }
    static validate(lineString) {
        if (lineString.type !== 'LineString' || !type_1.isArray(lineString.coordinates)) {
            return false;
        }
        for (let point of lineString.coordinates) {
            if (!type_1.isNumber(point[0]) || !type_1.isNumber(point[1])) {
                return false;
            }
        }
        return true;
    }
    static isClosed(lineString) {
        const firstPoint = lineString.points[0];
        const lastPoint = lineString.points[lineString.points.length - 1];
        if (firstPoint.latitude === lastPoint.latitude && firstPoint.longitude === lastPoint.longitude) {
            return true;
        }
    }
    get _internalType() {
        return symbol_1.SYMBOL_GEO_LINE_STRING;
    }
}
exports.LineString = LineString;

}, function(modId) { var map = {"../helper/symbol":1662121424066,"./point":1662121424061,"../utils/type":1662121424068}; return __REQUIRE__(map[modId], modId); })
__DEFINE__(1662121424070, function(require, module, exports) {

Object.defineProperty(exports, "__esModule", { value: true });
const symbol_1 = require("../helper/symbol");
const type_1 = require("../utils/type");
const lineString_1 = require("./lineString");
/**
 * 面
 *
 * @author starkewang
 */
class Polygon {
    /**
     * 初始化
     *
     * @param lines    - LineString
     */
    constructor(lines) {
        if (!type_1.isArray(lines)) {
            throw new TypeError(`"lines" must be of type LineString[]. Received type ${typeof lines}`);
        }
        if (lines.length === 0) {
            throw new Error('Polygon must contain 1 linestring at least');
        }
        lines.forEach(line => {
            if (!(line instanceof lineString_1.LineString)) {
                throw new TypeError(`"lines" must be of type LineString[]. Received type ${typeof line}[]`);
            }
            if (!lineString_1.LineString.isClosed(line)) {
                throw new Error(`LineString ${line.points.map(p => p.toReadableString())} is not a closed cycle`);
            }
        });
        this.lines = lines;
    }
    parse(key) {
        return {
            [key]: {
                type: 'Polygon',
                coordinates: this.lines.map(line => {
                    return line.points.map(point => [point.longitude, point.latitude]);
                })
            }
        };
    }
    toJSON() {
        return {
            type: 'Polygon',
            coordinates: this.lines.map(line => {
                return line.points.map(point => [point.longitude, point.latitude]);
            })
        };
    }
    static validate(polygon) {
        if (polygon.type !== 'Polygon' || !type_1.isArray(polygon.coordinates)) {
            return false;
        }
        for (let line of polygon.coordinates) {
            if (!this.isCloseLineString(line)) {
                return false;
            }
            for (let point of line) {
                if (!type_1.isNumber(point[0]) || !type_1.isNumber(point[1])) {
                    return false;
                }
            }
        }
        return true;
    }
    static isCloseLineString(lineString) {
        const firstPoint = lineString[0];
        const lastPoint = lineString[lineString.length - 1];
        if (firstPoint[0] !== lastPoint[0] || firstPoint[1] !== lastPoint[1]) {
            return false;
        }
        return true;
    }
    get _internalType() {
        return symbol_1.SYMBOL_GEO_MULTI_POLYGON;
    }
}
exports.Polygon = Polygon;

}, function(modId) { var map = {"../helper/symbol":1662121424066,"../utils/type":1662121424068,"./lineString":1662121424069}; return __REQUIRE__(map[modId], modId); })
__DEFINE__(1662121424071, function(require, module, exports) {

Object.defineProperty(exports, "__esModule", { value: true });
const symbol_1 = require("../helper/symbol");
const point_1 = require("./point");
const type_1 = require("../utils/type");
/**
 * 多个 Point
 *
 * @author starkewang
 */
class MultiPoint {
    /**
     * 初始化
     *
     * @param points    - GeoPoint
     */
    constructor(points) {
        if (!type_1.isArray(points)) {
            throw new TypeError(`"points" must be of type Point[]. Received type ${typeof points}`);
        }
        if (points.length === 0) {
            throw new Error('"points" must contain 1 point at least');
        }
        points.forEach(point => {
            if (!(point instanceof point_1.Point)) {
                throw new TypeError(`"points" must be of type Point[]. Received type ${typeof point}[]`);
            }
        });
        this.points = points;
    }
    parse(key) {
        return {
            [key]: {
                type: 'MultiPoint',
                coordinates: this.points.map(point => point.toJSON().coordinates)
            }
        };
    }
    toJSON() {
        return {
            type: 'MultiPoint',
            coordinates: this.points.map(point => point.toJSON().coordinates)
        };
    }
    static validate(multiPoint) {
        if (multiPoint.type !== 'MultiPoint' || !type_1.isArray(multiPoint.coordinates)) {
            return false;
        }
        for (let point of multiPoint.coordinates) {
            if (!type_1.isNumber(point[0]) || !type_1.isNumber(point[1])) {
                return false;
            }
        }
        return true;
    }
    get _internalType() {
        return symbol_1.SYMBOL_GEO_MULTI_POINT;
    }
}
exports.MultiPoint = MultiPoint;

}, function(modId) { var map = {"../helper/symbol":1662121424066,"./point":1662121424061,"../utils/type":1662121424068}; return __REQUIRE__(map[modId], modId); })
__DEFINE__(1662121424072, function(require, module, exports) {

Object.defineProperty(exports, "__esModule", { value: true });
const symbol_1 = require("../helper/symbol");
const type_1 = require("../utils/type");
const lineString_1 = require("./lineString");
/**
 * 多个 LineString
 *
 * @author starkewang
 */
class MultiLineString {
    /**
     * 初始化
     *
     * @param lines    - LineString
     */
    constructor(lines) {
        if (!type_1.isArray(lines)) {
            throw new TypeError(`"lines" must be of type LineString[]. Received type ${typeof lines}`);
        }
        if (lines.length === 0) {
            throw new Error('Polygon must contain 1 linestring at least');
        }
        lines.forEach(line => {
            if (!(line instanceof lineString_1.LineString)) {
                throw new TypeError(`"lines" must be of type LineString[]. Received type ${typeof line}[]`);
            }
        });
        this.lines = lines;
    }
    parse(key) {
        return {
            [key]: {
                type: 'MultiLineString',
                coordinates: this.lines.map(line => {
                    return line.points.map(point => [point.longitude, point.latitude]);
                })
            }
        };
    }
    toJSON() {
        return {
            type: 'MultiLineString',
            coordinates: this.lines.map(line => {
                return line.points.map(point => [point.longitude, point.latitude]);
            })
        };
    }
    static validate(multiLineString) {
        if (multiLineString.type !== 'MultiLineString' || !type_1.isArray(multiLineString.coordinates)) {
            return false;
        }
        for (let line of multiLineString.coordinates) {
            for (let point of line) {
                if (!type_1.isNumber(point[0]) || !type_1.isNumber(point[1])) {
                    return false;
                }
            }
        }
        return true;
    }
    get _internalType() {
        return symbol_1.SYMBOL_GEO_MULTI_LINE_STRING;
    }
}
exports.MultiLineString = MultiLineString;

}, function(modId) { var map = {"../helper/symbol":1662121424066,"../utils/type":1662121424068,"./lineString":1662121424069}; return __REQUIRE__(map[modId], modId); })
__DEFINE__(1662121424073, function(require, module, exports) {

Object.defineProperty(exports, "__esModule", { value: true });
const symbol_1 = require("../helper/symbol");
const type_1 = require("../utils/type");
const polygon_1 = require("./polygon");
/**
 * 多个面
 *
 * @author starkewang
 */
class MultiPolygon {
    /**
     * 初始化
     *
     * @param polygons    - Polygon[]
     */
    constructor(polygons) {
        if (!type_1.isArray(polygons)) {
            throw new TypeError(`"polygons" must be of type Polygon[]. Received type ${typeof polygons}`);
        }
        if (polygons.length === 0) {
            throw new Error('MultiPolygon must contain 1 polygon at least');
        }
        for (let polygon of polygons) {
            if (!(polygon instanceof polygon_1.Polygon)) {
                throw new TypeError(`"polygon" must be of type Polygon[]. Received type ${typeof polygon}[]`);
            }
        }
        this.polygons = polygons;
    }
    parse(key) {
        return {
            [key]: {
                type: 'MultiPolygon',
                coordinates: this.polygons.map(polygon => {
                    return polygon.lines.map(line => {
                        return line.points.map(point => [point.longitude, point.latitude]);
                    });
                })
            }
        };
    }
    toJSON() {
        return {
            type: 'MultiPolygon',
            coordinates: this.polygons.map(polygon => {
                return polygon.lines.map(line => {
                    return line.points.map(point => [point.longitude, point.latitude]);
                });
            })
        };
    }
    static validate(multiPolygon) {
        if (multiPolygon.type !== 'MultiPolygon' || !type_1.isArray(multiPolygon.coordinates)) {
            return false;
        }
        for (let polygon of multiPolygon.coordinates) {
            for (let line of polygon) {
                for (let point of line) {
                    if (!type_1.isNumber(point[0]) || !type_1.isNumber(point[1])) {
                        return false;
                    }
                }
            }
        }
        return true;
    }
    get _internalType() {
        return symbol_1.SYMBOL_GEO_POLYGON;
    }
}
exports.MultiPolygon = MultiPolygon;

}, function(modId) { var map = {"../helper/symbol":1662121424066,"../utils/type":1662121424068,"./polygon":1662121424070}; return __REQUIRE__(map[modId], modId); })
__DEFINE__(1662121424074, function(require, module, exports) {

Object.defineProperty(exports, "__esModule", { value: true });
const document_1 = require("./document");
const query_1 = require("./query");
const aggregate_1 = require("./aggregate");
/**
 * 集合模块，继承 Query 模块
 *
 */
class CollectionReference extends query_1.Query {
    /**
     * 初始化
     *
     * @internal
     *
     * @param db    - 数据库的引用
     * @param coll  - 集合名称
     */
    constructor(db, coll) {
        super(db, coll);
    }
    /**
     * 读取集合名字
     */
    get name() {
        return this._coll;
    }
    /**
     * 获取文档的引用
     *
     * @param docID - 文档 ID
     */
    doc(docID) {
        if (!docID) {
            throw new Error('docID cannot be empty');
        }
        return new document_1.DocumentReference(this._db, this._coll, docID);
    }
    /**
     * 添加一篇文档
     *
     * @param data - 数据
     */
    add(data, options) {
        let docRef = new document_1.DocumentReference(this._db, this._coll, undefined);
        return docRef.create(data, options);
    }
    aggregate(rawPipeline = []) {
        return new aggregate_1.default(this._db, this._coll, rawPipeline);
    }
}
exports.CollectionReference = CollectionReference;

}, function(modId) { var map = {"./document":1662121424075,"./query":1662121424078,"./aggregate":1662121424085}; return __REQUIRE__(map[modId], modId); })
__DEFINE__(1662121424075, function(require, module, exports) {

Object.defineProperty(exports, "__esModule", { value: true });
const datatype_1 = require("./serializer/datatype");
const update_1 = require("./commands/update");
const constant_1 = require("./constant");
const query_1 = require("./query");
/**
 * Db document
 */
class DocumentReference {
    /**
     * @param db    - db ref
     * @param coll  - collection
     * @param docID - document id
     */
    constructor(db, coll, docID, query) {
        this._db = db;
        this._coll = coll;
        this.id = docID;
        this._query = query || new query_1.Query(db, coll);
    }
    /**
     * 创建一篇文档
     *
     * @param data - document data
     */
    async create(data, options) {
        var _a, _b;
        if (!data || typeof data !== 'object' || 0 === ((_a = Object.keys(data)) === null || _a === void 0 ? void 0 : _a.length)) {
            throw new Error('data cannot be empty object');
        }
        const params = {
            collectionName: this._coll,
            data: datatype_1.serialize(data),
            multi: (_b = options === null || options === void 0 ? void 0 : options.multi) !== null && _b !== void 0 ? _b : false
        };
        const res = await this._query
            .send(constant_1.ActionType.add, params);
        if (res.error) {
            return {
                requestId: res.requestId,
                error: res.error,
                ok: false,
                id: undefined,
                insertedCount: undefined,
                code: res.code
            };
        }
        return {
            id: res.data._id || res.data[this._db.primaryKey],
            insertedCount: res.data.insertedCount,
            requestId: res.requestId,
            ok: true
        };
    }
    /**
     * 创建或添加数据
     *
     * 如果该文档 ID 在数据库中不存在，则创建该文档并插入数据，根据返回数据的 upsertId 判断
     *
     * @param data - document data
     */
    async set(data) {
        if (!this.id) {
            throw new Error('document id cannot be empty');
        }
        let hasOperator = false;
        const checkMixed = (objs) => {
            if (typeof objs === 'object') {
                for (let key in objs) {
                    if (objs[key] instanceof update_1.UpdateCommand) {
                        hasOperator = true;
                    }
                    else if (typeof objs[key] === 'object') {
                        checkMixed(objs[key]);
                    }
                }
            }
        };
        checkMixed(data);
        if (hasOperator) {
            // 不能包含操作符
            throw new Error('data cannot contain operator');
        }
        // merge === false indicates replace operation
        const merge = false;
        const res = await this._query
            .where({ [this._db.primaryKey]: this.id })
            .update(datatype_1.serialize(data), { merge, multi: false, upsert: true });
        return res;
    }
    /**
     * 更新数据
     *
     * @param data - 文档数据
     */
    async update(data) {
        // 把所有更新数据转为带操作符的
        const merge = true;
        const options = { merge, multi: false, upsert: false };
        const res = await this._query
            .where({ [this._db.primaryKey]: this.id })
            .update(data, options);
        return res;
    }
    /**
     * 删除文档
     */
    async remove() {
        const res = await this._query
            .where({ [this._db.primaryKey]: this.id })
            .remove({ multi: false });
        return res;
    }
    /**
     * 返回选中的文档
     */
    async get() {
        const res = await this._query
            .where({ [this._db.primaryKey]: this.id })
            .getOne();
        return res;
    }
    /**
     * 指定要返回的字段
     *
     * @param projection
     */
    field(projection) {
        return new DocumentReference(this._db, this._coll, this.id, this._query.field(projection));
    }
}
exports.DocumentReference = DocumentReference;

}, function(modId) { var map = {"./serializer/datatype":1662121424076,"./commands/update":1662121424077,"./constant":1662121424063,"./query":1662121424078}; return __REQUIRE__(map[modId], modId); })
__DEFINE__(1662121424076, function(require, module, exports) {

Object.defineProperty(exports, "__esModule", { value: true });
// transpile internal data type
const symbol_1 = require("../helper/symbol");
const type_1 = require("../utils/type");
const index_1 = require("../geo/index");
const index_2 = require("../serverDate/index");
const bson_1 = require("bson");
function serialize(val) {
    return serializeHelper(val, [val]);
}
exports.serialize = serialize;
function serializeHelper(val, visited) {
    if (type_1.isInternalObject(val)) {
        switch (val._internalType) {
            case symbol_1.SYMBOL_GEO_POINT: {
                return val.toJSON();
            }
            case symbol_1.SYMBOL_SERVER_DATE: {
                return val.parse();
            }
            case symbol_1.SYMBOL_REGEXP: {
                return val.parse();
            }
            default: {
                return val.toJSON ? val.toJSON() : val;
            }
        }
    }
    else if (type_1.isDate(val) || type_1.isRegExp(val) || type_1.isObjectId(val) || type_1.isBinary(val)) {
        return bson_1.EJSON.serialize(val);
    }
    else if (type_1.isArray(val)) {
        return val.map(item => {
            if (visited.indexOf(item) > -1) {
                throw new Error('Cannot convert circular structure to JSON');
            }
            return serializeHelper(item, [
                ...visited,
                item,
            ]);
        });
    }
    else if (type_1.isObject(val)) {
        const ret = Object.assign({}, val);
        for (const key in ret) {
            if (visited.indexOf(ret[key]) > -1) {
                throw new Error('Cannot convert circular structure to JSON');
            }
            ret[key] = serializeHelper(ret[key], [
                ...visited,
                ret[key],
            ]);
        }
        return ret;
    }
    else {
        return val;
    }
}
function deserialize(object) {
    const ret = Object.assign({}, object);
    for (const key in ret) {
        switch (key) {
            case '$date': {
                switch (type_1.getType(ret[key])) {
                    case 'number': {
                        // normal timestamp
                        return new Date(ret[key]);
                    }
                    case 'object': {
                        // serverDate
                        return new index_2.ServerDate(ret[key]);
                    }
                }
                break;
            }
            case 'type': {
                switch (ret.type) {
                    case 'Point': {
                        // GeoPoint
                        if (type_1.isArray(ret.coordinates) && type_1.isNumber(ret.coordinates[0]) && type_1.isNumber(ret.coordinates[1])) {
                            return new index_1.Point(ret.coordinates[0], ret.coordinates[1]);
                        }
                        break;
                    }
                }
                break;
            }
        }
    }
    return object;
}
exports.deserialize = deserialize;

}, function(modId) { var map = {"../helper/symbol":1662121424066,"../utils/type":1662121424068,"../geo/index":1662121424060,"../serverDate/index":1662121424065}; return __REQUIRE__(map[modId], modId); })
__DEFINE__(1662121424077, function(require, module, exports) {

Object.defineProperty(exports, "__esModule", { value: true });
const symbol_1 = require("../helper/symbol");
var UPDATE_COMMANDS_LITERAL;
(function (UPDATE_COMMANDS_LITERAL) {
    UPDATE_COMMANDS_LITERAL["SET"] = "set";
    UPDATE_COMMANDS_LITERAL["REMOVE"] = "remove";
    UPDATE_COMMANDS_LITERAL["INC"] = "inc";
    UPDATE_COMMANDS_LITERAL["MUL"] = "mul";
    UPDATE_COMMANDS_LITERAL["PUSH"] = "push";
    UPDATE_COMMANDS_LITERAL["PULL"] = "pull";
    UPDATE_COMMANDS_LITERAL["PULL_ALL"] = "pullAll";
    UPDATE_COMMANDS_LITERAL["POP"] = "pop";
    UPDATE_COMMANDS_LITERAL["SHIFT"] = "shift";
    UPDATE_COMMANDS_LITERAL["UNSHIFT"] = "unshift";
    UPDATE_COMMANDS_LITERAL["ADD_TO_SET"] = "addToSet";
    UPDATE_COMMANDS_LITERAL["BIT"] = "bit";
    UPDATE_COMMANDS_LITERAL["RENAME"] = "rename";
    UPDATE_COMMANDS_LITERAL["MAX"] = "max";
    UPDATE_COMMANDS_LITERAL["MIN"] = "min";
})(UPDATE_COMMANDS_LITERAL = exports.UPDATE_COMMANDS_LITERAL || (exports.UPDATE_COMMANDS_LITERAL = {}));
class UpdateCommand {
    constructor(operator, operands, fieldName) {
        this._internalType = symbol_1.SYMBOL_UPDATE_COMMAND;
        Object.defineProperties(this, {
            _internalType: {
                enumerable: false,
                configurable: false,
            },
        });
        this.operator = operator;
        this.operands = operands;
        this.fieldName = fieldName || symbol_1.SYMBOL_UNSET_FIELD_NAME;
    }
    _setFieldName(fieldName) {
        const command = new UpdateCommand(this.operator, this.operands, fieldName);
        return command;
    }
}
exports.UpdateCommand = UpdateCommand;
function isUpdateCommand(object) {
    return object && (object instanceof UpdateCommand) && (object._internalType === symbol_1.SYMBOL_UPDATE_COMMAND);
}
exports.isUpdateCommand = isUpdateCommand;
function isKnownUpdateCommand(object) {
    return isUpdateCommand(object) && (object.operator.toUpperCase() in UPDATE_COMMANDS_LITERAL);
}
exports.isKnownUpdateCommand = isKnownUpdateCommand;
exports.default = UpdateCommand;

}, function(modId) { var map = {"../helper/symbol":1662121424066}; return __REQUIRE__(map[modId], modId); })
__DEFINE__(1662121424078, function(require, module, exports) {

Object.defineProperty(exports, "__esModule", { value: true });
const constant_1 = require("./constant");
const validate_1 = require("./validate");
// import { Util } from './util'
const query_1 = require("./serializer/query");
const update_1 = require("./serializer/update");
const constant_2 = require("./constant");
const util_1 = require("./util");
const datatype_1 = require("./serializer/datatype");
/**
 * Db query
 */
class Query {
    /**
     * @param db            - db reference
     * @param coll          - collection name
     * @param fieldFilters  - query condition
     * @param fieldOrders   - order by condition
     * @param queryOptions  - query options
     */
    constructor(db, coll, fieldFilters, fieldOrders, queryOptions, withs) {
        this._db = db;
        this._coll = coll;
        this._fieldFilters = fieldFilters;
        this._fieldOrders = fieldOrders || [];
        this._queryOptions = queryOptions || {};
        this._withs = withs || [];
        this._request = this._db.request;
    }
    /**
     * 查询条件
     *
     * @param query
     */
    where(query) {
        // query校验 1. 必填对象类型  2. value 不可均为 undefiend
        if (Object.prototype.toString.call(query).slice(8, -1) !== 'Object') {
            throw Error(constant_2.ErrorCode.QueryParamTypeError);
        }
        const keys = Object.keys(query);
        const checkFlag = keys.some(item => {
            return query[item] !== undefined;
        });
        if (keys.length && !checkFlag) {
            throw Error(constant_2.ErrorCode.QueryParamValueError);
        }
        const _query = query_1.QuerySerializer.encode(query);
        return new Query(this._db, this._coll, _query, this._fieldOrders, this._queryOptions, this._withs);
    }
    /**
     * 设置排序方式
     *
     * @param fieldPath     - 字段路径
     * @param directionStr  - 排序方式
     */
    orderBy(fieldPath, directionStr) {
        validate_1.Validate.isFieldPath(fieldPath);
        validate_1.Validate.isFieldOrder(directionStr);
        const newOrder = {
            field: fieldPath,
            direction: directionStr
        };
        const combinedOrders = this._fieldOrders.concat(newOrder);
        return new Query(this._db, this._coll, this._fieldFilters, combinedOrders, this._queryOptions, this._withs);
    }
    /**
     * 添加 一对多 子查询条件
     * @param param {WithParam}
     * @returns Query
     */
    with(param) {
        var _a, _b;
        const newWith = {
            query: param.query,
            foreignField: param.foreignField,
            localField: param.localField,
            as: (_a = param.as) !== null && _a !== void 0 ? _a : param.query._coll,
            one: (_b = param.one) !== null && _b !== void 0 ? _b : false
        };
        const combinedWiths = this._withs.concat(newWith);
        return new Query(this._db, this._coll, this._fieldFilters, this._fieldOrders, this._queryOptions, combinedWiths);
    }
    /**
     * 添加 一对一 子查询条件
     * @param param {WithParam}
     * @returns Query
     */
    withOne(param) {
        var _a;
        const newWith = {
            query: param.query,
            foreignField: param.foreignField,
            localField: param.localField,
            as: (_a = param.as) !== null && _a !== void 0 ? _a : param.query._coll,
            one: true
        };
        const combinedWiths = this._withs.concat(newWith);
        return new Query(this._db, this._coll, this._fieldFilters, this._fieldOrders, this._queryOptions, combinedWiths);
    }
    /**
     * 指定要返回的字段
     *
     * @param projection
     */
    field(projection) {
        let formatted = {};
        if (projection instanceof Array) {
            let result = {};
            for (let k of projection) {
                result[k] = 1;
            }
            formatted = result;
        }
        else {
            for (let k in projection) {
                if (projection[k]) {
                    if (typeof projection[k] !== 'object') {
                        formatted[k] = 1;
                    }
                }
                else {
                    formatted[k] = 0;
                }
            }
        }
        const option = Object.assign({}, this._queryOptions);
        option.projection = formatted;
        return new Query(this._db, this._coll, this._fieldFilters, this._fieldOrders, option, this._withs);
    }
    /**
     * 设置查询条数
     *
     * @param limit - 限制条数，当前限制一次请求获取数据条数不得大于 1000
     */
    limit(limit) {
        validate_1.Validate.isInteger('limit', limit);
        let option = Object.assign({}, this._queryOptions);
        option.limit = limit;
        return new Query(this._db, this._coll, this._fieldFilters, this._fieldOrders, option, this._withs);
    }
    /**
     * 设置偏移量
     *
     * @param offset - 偏移量
     */
    skip(offset) {
        validate_1.Validate.isInteger('offset', offset);
        let option = Object.assign({}, this._queryOptions);
        option.offset = offset;
        return new Query(this._db, this._coll, this._fieldFilters, this._fieldOrders, option, this._withs);
    }
    /**
     * 设置分页查询
     * @param options { current: number, size: number} `current` 是页码，默认为 `1`, `size` 是每页大小, 默认为 10
     */
    page(options) {
        const current = (options === null || options === void 0 ? void 0 : options.current) || 1;
        const size = (options === null || options === void 0 ? void 0 : options.size) || 10;
        const query = this
            .skip((current - 1) * size)
            .limit(size);
        query._queryOptions.count = true;
        return query;
    }
    /**
     * 克隆
     * @returns Query
     */
    clone() {
        return new Query(this._db, this._coll, this._fieldFilters, this._fieldOrders, this._queryOptions, this._withs);
    }
    /**
     * 发起请求获取文档列表
     *
     * - 默认 `limit` 为 100
     * - 可以把通过 `orderBy()`、`where()`、`skip()`、`limit()`设置的数据添加请求参数上
     */
    async get() {
        var _a;
        if ((_a = this._withs) === null || _a === void 0 ? void 0 : _a.length) {
            return await this.internalMerge();
        }
        else {
            return await this.internalGet();
        }
    }
    /**
     * 发起请求获取一个文档
     * @param options
     * @returns
     */
    async getOne() {
        const res = await this.limit(1).get();
        if (res.error) {
            return res;
        }
        if (!res.data.length) {
            return {
                ok: true,
                data: null,
                requestId: res.requestId
            };
        }
        return {
            ok: true,
            data: res.data[0],
            requestId: res.requestId
        };
    }
    /**
     * [该接口已废弃，直接使用 `get()` 代替]
     * 发起请求获取文档列表，当使用 with 条件时使用
     *
     * @deprecated
     *
     * 1. 调用 get() 执行主查询
     * 2. 结合主查询的结果，使用 in 执行子表查询
     * 3. 合并主表 & 子表的结果，即聚合
     * 4. intersection 可指定是否取两个结果集的交集，缺省则以主表结果为主
     */
    async merge(options) {
        const res = await this.internalMerge(options);
        return res;
    }
    /**
     * 获取总数
     */
    async count() {
        const param = this.buildQueryParam();
        const res = await this.send(constant_1.ActionType.count, param);
        if (res.error) {
            return {
                requestId: res.requestId,
                ok: false,
                error: res.error,
                total: undefined,
                code: res.code
            };
        }
        return {
            requestId: res.requestId,
            total: res.data.total,
            ok: true
        };
    }
    /**
     * 发起请求批量更新文档
     *
     * @param data 数据
     */
    async update(data, options) {
        var _a, _b, _c, _d;
        if (!data || typeof data !== 'object' || 0 === ((_a = Object.keys(data)) === null || _a === void 0 ? void 0 : _a.length)) {
            throw new Error('data cannot be empty object');
        }
        if (data.hasOwnProperty('_id')) {
            throw new Error('can not update the `_id` field');
        }
        const param = this.buildQueryParam();
        param.multi = (_b = options === null || options === void 0 ? void 0 : options.multi) !== null && _b !== void 0 ? _b : false;
        param.merge = (_c = options === null || options === void 0 ? void 0 : options.merge) !== null && _c !== void 0 ? _c : true;
        param.upsert = (_d = options === null || options === void 0 ? void 0 : options.upsert) !== null && _d !== void 0 ? _d : false;
        if (param.merge) {
            param.data = update_1.UpdateSerializer.encode(data);
        }
        else {
            param.data = datatype_1.serialize(data);
        }
        const res = await this.send(constant_1.ActionType.update, param);
        if (res.error) {
            return {
                requestId: res.requestId,
                error: res.error,
                ok: false,
                code: res.code,
                updated: undefined,
                matched: undefined,
                upsertId: undefined
            };
        }
        return {
            requestId: res.requestId,
            updated: res.data.updated,
            matched: res.data.matched,
            upsertId: res.data.upsert_id,
            ok: true
        };
    }
    /**
     * 条件删除文档
     */
    async remove(options) {
        var _a, _b;
        if (Object.keys(this._queryOptions).length > 0) {
            console.warn('`offset`, `limit` and `projection` are not supported in remove() operation');
        }
        if (((_a = this._fieldOrders) === null || _a === void 0 ? void 0 : _a.length) > 0) {
            console.warn('`orderBy` is not supported in remove() operation');
        }
        const param = this.buildQueryParam();
        param.multi = (_b = options === null || options === void 0 ? void 0 : options.multi) !== null && _b !== void 0 ? _b : false;
        const res = await this.send(constant_1.ActionType.remove, param);
        if (res.error) {
            return {
                requestId: res.requestId,
                error: res.error,
                ok: false,
                deleted: undefined,
                code: res.code
            };
        }
        return {
            requestId: res.requestId,
            deleted: res.data.deleted,
            ok: true
        };
    }
    /**
     * Build query param
     * @returns
     */
    buildQueryParam() {
        var _a;
        const param = {
            collectionName: this._coll,
        };
        if (this._fieldFilters) {
            param.query = this._fieldFilters;
        }
        if ((_a = this._fieldOrders) === null || _a === void 0 ? void 0 : _a.length) {
            param.order = [...this._fieldOrders];
        }
        if (this._queryOptions.offset) {
            param.offset = this._queryOptions.offset;
        }
        if (this._queryOptions.limit) {
            param.limit = this._queryOptions.limit < 1000 ? this._queryOptions.limit : 1000;
        }
        else {
            param.limit = 100;
        }
        if (this._queryOptions.projection) {
            param.projection = this._queryOptions.projection;
        }
        if (this._queryOptions.count) {
            param.count = this._queryOptions.count;
        }
        return param;
    }
    /**
    * 发起请求获取文档列表
    */
    async internalGet() {
        var _a, _b, _c;
        const param = this.buildQueryParam();
        const res = await this.send(constant_1.ActionType.query, param);
        if (res.error) {
            return {
                error: res.error,
                data: res.data,
                requestId: res.requestId,
                ok: false,
                code: res.code
            };
        }
        const documents = util_1.Util.formatResDocumentData(res.data.list);
        const result = {
            data: documents,
            requestId: res.requestId,
            ok: true
        };
        if (res.total)
            result.total = (_a = res.data) === null || _a === void 0 ? void 0 : _a.total;
        if (res.limit)
            result.limit = (_b = res.data) === null || _b === void 0 ? void 0 : _b.limit;
        if (res.offset)
            result.offset = (_c = res.data) === null || _c === void 0 ? void 0 : _c.offset;
        return result;
    }
    /**
     * 发起请求获取文档列表，当使用 with 条件时使用
     *
     * 1. 调用 internalGet() 执行主查询
     * 2. 结合主查询的结果，使用 in 执行子表查询
     * 3. 合并主表 & 子表的结果，即聚合
     * 4. intersection 可指定是否取两个结果集的交集，缺省则以主表结果为主
     */
    async internalMerge(options) {
        var _a;
        options = options !== null && options !== void 0 ? options : {};
        const intersection = (_a = options === null || options === void 0 ? void 0 : options.intersection) !== null && _a !== void 0 ? _a : false;
        // 调用 get() 执行主查询
        const res = await this.internalGet();
        if (!res.ok) {
            return res;
        }
        // 针对每一个 WithParam 做合并处理
        for (let _with of this._withs) {
            const { query, localField, foreignField, as, one } = _with;
            const localValues = res.data.map(localData => localData[localField]);
            // 处理子查询
            let q = query.clone();
            if (!q._fieldFilters) {
                q._fieldFilters = {};
            }
            q._fieldFilters[foreignField] = { '$in': localValues };
            // 执行子查询
            let r_sub;
            if (q._withs.length) {
                r_sub = await q.merge(); // 如果子查询也使用了 with/withOne，则使用 merge() 查询
            }
            else {
                r_sub = await q.get();
            }
            if (!r_sub.ok) {
                return r_sub;
            }
            // 按照 localField -> foreignField 的连接关系将子查询结果聚合：
            // 1. 构建 { [value of `foreignField`]: [subQueryData] } 映射表
            const _map = {};
            for (let sub of r_sub.data) {
                const key = sub[foreignField]; // 将子表结果的连接键的值做为映射表的 key
                if (one) {
                    _map[key] = sub;
                }
                else {
                    _map[key] = _map[key] || [];
                    _map[key].push(sub); // 将子表结果放入映射表
                }
            }
            // 2. 将聚合结果合并入主表结果集中
            const results = [];
            for (let m of res.data) {
                // 此处主表结果中的 [value of `localField`] 与 上面子表结果中的 [value of `foreignField`] 应该是一致的
                const key = m[localField];
                m[as] = _map[key];
                // 如果取交集且子表结果无对应数据，则丢弃此条数据
                if (intersection && !_map[key]) {
                    continue;
                }
                results.push(m);
            }
            res.data = results;
        }
        return res;
    }
    /**
     * Send query request
     * @param action
     * @param param
     * @returns
     */
    async send(action, param) {
        return await this._request.send(action, param);
    }
}
exports.Query = Query;

}, function(modId) { var map = {"./constant":1662121424063,"./validate":1662121424062,"./serializer/query":1662121424079,"./serializer/update":1662121424084,"./util":1662121424064,"./serializer/datatype":1662121424076}; return __REQUIRE__(map[modId], modId); })
__DEFINE__(1662121424079, function(require, module, exports) {

Object.defineProperty(exports, "__esModule", { value: true });
const query_1 = require("../commands/query");
const logic_1 = require("../commands/logic");
const symbol_1 = require("../helper/symbol");
const type_1 = require("../utils/type");
const operator_map_1 = require("../operator-map");
const common_1 = require("./common");
class QuerySerializer {
    constructor() { }
    static encode(query) {
        const encoder = new QueryEncoder();
        return encoder.encodeQuery(query);
    }
}
exports.QuerySerializer = QuerySerializer;
class QueryEncoder {
    encodeQuery(query, key) {
        if (common_1.isConversionRequired(query)) {
            if (logic_1.isLogicCommand(query)) {
                return this.encodeLogicCommand(query);
            }
            else if (query_1.isQueryCommand(query)) {
                return this.encodeQueryCommand(query);
            }
            else {
                return { [key]: this.encodeQueryObject(query) };
            }
        }
        else {
            if (type_1.isObject(query)) {
                return this.encodeQueryObject(query);
            }
            else {
                // abnormal case, should not enter this block
                return query;
            }
        }
    }
    encodeRegExp(query) {
        return {
            $regex: query.source,
            $options: query.flags
        };
    }
    encodeLogicCommand(query) {
        switch (query.operator) {
            case logic_1.LOGIC_COMMANDS_LITERAL.NOR:
            case logic_1.LOGIC_COMMANDS_LITERAL.AND:
            case logic_1.LOGIC_COMMANDS_LITERAL.OR: {
                const $op = operator_map_1.operatorToString(query.operator);
                const subqueries = query.operands.map(oprand => this.encodeQuery(oprand, query.fieldName));
                return {
                    [$op]: subqueries
                };
            }
            case logic_1.LOGIC_COMMANDS_LITERAL.NOT: {
                const $op = operator_map_1.operatorToString(query.operator);
                const operatorExpression = query.operands[0];
                if (type_1.isRegExp(operatorExpression)) {
                    return {
                        [query.fieldName]: {
                            [$op]: this.encodeRegExp(operatorExpression)
                        }
                    };
                }
                else {
                    const subqueries = this.encodeQuery(operatorExpression)[query.fieldName];
                    return {
                        [query.fieldName]: {
                            [$op]: subqueries
                        }
                    };
                }
            }
            default: {
                const $op = operator_map_1.operatorToString(query.operator);
                if (query.operands.length === 1) {
                    const subquery = this.encodeQuery(query.operands[0]);
                    return {
                        [$op]: subquery
                    };
                }
                else {
                    const subqueries = query.operands.map(this.encodeQuery.bind(this));
                    return {
                        [$op]: subqueries
                    };
                }
            }
        }
    }
    encodeQueryCommand(query) {
        if (query_1.isComparisonCommand(query)) {
            return this.encodeComparisonCommand(query);
        }
        else {
            // TODO: when more command types are added, change it here
            return this.encodeComparisonCommand(query);
        }
    }
    encodeComparisonCommand(query) {
        if (query.fieldName === symbol_1.SYMBOL_UNSET_FIELD_NAME) {
            throw new Error('Cannot encode a comparison command with unset field name');
        }
        const $op = operator_map_1.operatorToString(query.operator);
        switch (query.operator) {
            case query_1.QUERY_COMMANDS_LITERAL.EQ:
            case query_1.QUERY_COMMANDS_LITERAL.NEQ:
            case query_1.QUERY_COMMANDS_LITERAL.LT:
            case query_1.QUERY_COMMANDS_LITERAL.LTE:
            case query_1.QUERY_COMMANDS_LITERAL.GT:
            case query_1.QUERY_COMMANDS_LITERAL.GTE:
            case query_1.QUERY_COMMANDS_LITERAL.ELEM_MATCH:
            case query_1.QUERY_COMMANDS_LITERAL.EXISTS:
            case query_1.QUERY_COMMANDS_LITERAL.SIZE:
            case query_1.QUERY_COMMANDS_LITERAL.MOD: {
                return {
                    [query.fieldName]: {
                        [$op]: common_1.encodeInternalDataType(query.operands[0])
                    }
                };
            }
            case query_1.QUERY_COMMANDS_LITERAL.IN:
            case query_1.QUERY_COMMANDS_LITERAL.NIN:
            case query_1.QUERY_COMMANDS_LITERAL.ALL: {
                return {
                    [query.fieldName]: {
                        [$op]: common_1.encodeInternalDataType(query.operands)
                    }
                };
            }
            case query_1.QUERY_COMMANDS_LITERAL.GEO_NEAR: {
                const options = query.operands[0];
                return {
                    [query.fieldName]: {
                        $nearSphere: {
                            $geometry: options.geometry.toJSON(),
                            $maxDistance: options.maxDistance,
                            $minDistance: options.minDistance
                        }
                    }
                };
            }
            case query_1.QUERY_COMMANDS_LITERAL.GEO_WITHIN: {
                const options = query.operands[0];
                return {
                    [query.fieldName]: {
                        $geoWithin: {
                            $geometry: options.geometry.toJSON()
                        }
                    }
                };
            }
            case query_1.QUERY_COMMANDS_LITERAL.GEO_INTERSECTS: {
                const options = query.operands[0];
                return {
                    [query.fieldName]: {
                        $geoIntersects: {
                            $geometry: options.geometry.toJSON()
                        }
                    }
                };
            }
            default: {
                return {
                    [query.fieldName]: {
                        [$op]: common_1.encodeInternalDataType(query.operands[0])
                    }
                };
            }
        }
    }
    encodeQueryObject(query) {
        const flattened = common_1.flattenQueryObject(query);
        for (const key in flattened) {
            const val = flattened[key];
            if (logic_1.isLogicCommand(val)) {
                flattened[key] = val._setFieldName(key);
                const condition = this.encodeLogicCommand(flattened[key]);
                this.mergeConditionAfterEncode(flattened, condition, key);
            }
            else if (query_1.isComparisonCommand(val)) {
                flattened[key] = val._setFieldName(key);
                const condition = this.encodeComparisonCommand(flattened[key]);
                this.mergeConditionAfterEncode(flattened, condition, key);
            }
            else if (common_1.isConversionRequired(val)) {
                flattened[key] = common_1.encodeInternalDataType(val);
            }
        }
        return flattened;
    }
    /**
     * @description Merge 2 query conditions
     * @example
     *
     * Normal cases:
     *
     * C1. merge top-level commands, such as $and and $or:
     * let A = { $and: [{a: 1}] }
     * let B = { $and: [{b: 2}] }
     * merge(A, B) == { $and: [{a: 1}, {b: 2}] }
     *
     * C2. merge top-level fields
     * let A = { a: { $gt: 1 } }
     * let B = { a: { $lt: 5 } }
     * merge(A, B) == { a: { $gt: 1, $lt: 5 } }
     *
     * Edge cases:
     *
     * E1. unmergable top-level fields
     * Solution: override
     * let A = { a: 1 }
     * let B = { a: { $gt: 1 } }
     * merge(A, B) == B
     *
     * @param query
     * @param condition
     * @param key
     */
    mergeConditionAfterEncode(query, condition, key) {
        if (!condition[key]) {
            delete query[key];
        }
        for (const conditionKey in condition) {
            if (query[conditionKey]) {
                if (type_1.isArray(query[conditionKey])) {
                    // bug
                    query[conditionKey] = query[conditionKey].concat(condition[conditionKey]);
                }
                else if (type_1.isObject(query[conditionKey])) {
                    if (type_1.isObject(condition[conditionKey])) {
                        Object.assign(query, condition);
                    }
                    else {
                        console.warn(`unmergable condition, query is object but condition is ${type_1.getType(condition)}, can only overwrite`, condition, key);
                        query[conditionKey] = condition[conditionKey];
                    }
                }
                else {
                    console.warn(`to-merge query is of type ${type_1.getType(query)}, can only overwrite`, query, condition, key);
                    query[conditionKey] = condition[conditionKey];
                }
            }
            else {
                query[conditionKey] = condition[conditionKey];
            }
        }
    }
}
/**

{
  prop: {
    mem: _.gt(4).and(_.lt(8)),
  },
  price: _.lt(5000).and(_.gt(3000))
}

=>

{
  prop: {
    mem: $and([
      $gt(4),
      $lt(8),
    ])
  },
  price: $and([
    $lt(5000),
    $gt(3000),
  ])
}

=>

{
  $and: [
    {
      'prop.mem': {
        $gt: 4,
        $lt: 8
      }
    },
    {
      'price': {
        $gt: 3000,
        $lt: 5000
      }
    }
  ]
}

 */
/**

_.or([
  {
    category: 'pc'
    prop: {
      mem: _.gt(8).and(_.lt(16)).or(_.eq(32))
    },
  },
  {
    category: 'pc'
    prop: {
      cpu: _.gt(3.2)
    }
  }
])

=>

_.or([
  {
    category: 'pc',
    prop: {
      mem: $or([
        $and([
          $gt(8),
          $lt(16),
        ]),
        $eq(32)
      ])
    }
  },
  {
    category: 'pc',
    prop: {
      cpu: $gt(3.2)
    }
  }
])

=>

{
  $or: [
    {
      //...
    },
    {
      //...
    }
  ]
}

=>

{
  $or: [
    {
      category: 'pc',
      $or: [
        $and: [
          'prop.mem': {
            $gt: 8,
            $lt: 16,
          },
        ],
        'prop.mem': {
          $eq: 32
        }
      ]
    },
    {
      category: 'pc',
      'prop.cpu': {
        $eq: 3.2
      }
    }
  ]
}

 */

}, function(modId) { var map = {"../commands/query":1662121424080,"../commands/logic":1662121424081,"../helper/symbol":1662121424066,"../utils/type":1662121424068,"../operator-map":1662121424082,"./common":1662121424083}; return __REQUIRE__(map[modId], modId); })
__DEFINE__(1662121424080, function(require, module, exports) {

Object.defineProperty(exports, "__esModule", { value: true });
const logic_1 = require("./logic");
const symbol_1 = require("../helper/symbol");
const index_1 = require("../geo/index");
const type_1 = require("../utils/type");
exports.EQ = 'eq';
exports.NEQ = 'neq';
exports.GT = 'gt';
exports.GTE = 'gte';
exports.LT = 'lt';
exports.LTE = 'lte';
exports.IN = 'in';
exports.NIN = 'nin';
exports.ALL = 'all';
exports.ELEM_MATCH = 'elemMatch';
exports.EXISTS = 'exists';
exports.SIZE = 'size';
exports.MOD = 'mod';
exports.LIKE = 'like';
var QUERY_COMMANDS_LITERAL;
(function (QUERY_COMMANDS_LITERAL) {
    QUERY_COMMANDS_LITERAL["EQ"] = "eq";
    QUERY_COMMANDS_LITERAL["NEQ"] = "neq";
    QUERY_COMMANDS_LITERAL["GT"] = "gt";
    QUERY_COMMANDS_LITERAL["GTE"] = "gte";
    QUERY_COMMANDS_LITERAL["LT"] = "lt";
    QUERY_COMMANDS_LITERAL["LTE"] = "lte";
    QUERY_COMMANDS_LITERAL["IN"] = "in";
    QUERY_COMMANDS_LITERAL["NIN"] = "nin";
    QUERY_COMMANDS_LITERAL["ALL"] = "all";
    QUERY_COMMANDS_LITERAL["ELEM_MATCH"] = "elemMatch";
    QUERY_COMMANDS_LITERAL["EXISTS"] = "exists";
    QUERY_COMMANDS_LITERAL["SIZE"] = "size";
    QUERY_COMMANDS_LITERAL["MOD"] = "mod";
    QUERY_COMMANDS_LITERAL["GEO_NEAR"] = "geoNear";
    QUERY_COMMANDS_LITERAL["GEO_WITHIN"] = "geoWithin";
    QUERY_COMMANDS_LITERAL["GEO_INTERSECTS"] = "geoIntersects";
    QUERY_COMMANDS_LITERAL["LIKE"] = "like";
})(QUERY_COMMANDS_LITERAL = exports.QUERY_COMMANDS_LITERAL || (exports.QUERY_COMMANDS_LITERAL = {}));
class QueryCommand extends logic_1.LogicCommand {
    constructor(operator, operands, fieldName) {
        super(operator, operands, fieldName);
        this.operator = operator;
        this._internalType = symbol_1.SYMBOL_QUERY_COMMAND;
    }
    toJSON() {
        switch (this.operator) {
            case QUERY_COMMANDS_LITERAL.IN:
            case QUERY_COMMANDS_LITERAL.NIN:
                return {
                    ['$' + this.operator]: this.operands
                };
            default:
                return {
                    ['$' + this.operator]: this.operands[0]
                };
        }
    }
    _setFieldName(fieldName) {
        const command = new QueryCommand(this.operator, this.operands, fieldName);
        return command;
    }
    eq(val) {
        const command = new QueryCommand(QUERY_COMMANDS_LITERAL.EQ, [val], this.fieldName);
        return this.and(command);
    }
    neq(val) {
        const command = new QueryCommand(QUERY_COMMANDS_LITERAL.NEQ, [val], this.fieldName);
        return this.and(command);
    }
    gt(val) {
        const command = new QueryCommand(QUERY_COMMANDS_LITERAL.GT, [val], this.fieldName);
        return this.and(command);
    }
    gte(val) {
        const command = new QueryCommand(QUERY_COMMANDS_LITERAL.GTE, [val], this.fieldName);
        return this.and(command);
    }
    lt(val) {
        const command = new QueryCommand(QUERY_COMMANDS_LITERAL.LT, [val], this.fieldName);
        return this.and(command);
    }
    lte(val) {
        const command = new QueryCommand(QUERY_COMMANDS_LITERAL.LTE, [val], this.fieldName);
        return this.and(command);
    }
    in(list) {
        const command = new QueryCommand(QUERY_COMMANDS_LITERAL.IN, list, this.fieldName);
        return this.and(command);
    }
    nin(list) {
        const command = new QueryCommand(QUERY_COMMANDS_LITERAL.NIN, list, this.fieldName);
        return this.and(command);
    }
    geoNear(val) {
        if (!(val.geometry instanceof index_1.Point)) {
            throw new TypeError(`"geometry" must be of type Point. Received type ${typeof val.geometry}`);
        }
        if (val.maxDistance !== undefined && !type_1.isNumber(val.maxDistance)) {
            throw new TypeError(`"maxDistance" must be of type Number. Received type ${typeof val.maxDistance}`);
        }
        if (val.minDistance !== undefined && !type_1.isNumber(val.minDistance)) {
            throw new TypeError(`"minDistance" must be of type Number. Received type ${typeof val.minDistance}`);
        }
        const command = new QueryCommand(QUERY_COMMANDS_LITERAL.GEO_NEAR, [val], this.fieldName);
        return this.and(command);
    }
    geoWithin(val) {
        if (!(val.geometry instanceof index_1.MultiPolygon) && !(val.geometry instanceof index_1.Polygon)) {
            throw new TypeError(`"geometry" must be of type Polygon or MultiPolygon. Received type ${typeof val.geometry}`);
        }
        const command = new QueryCommand(QUERY_COMMANDS_LITERAL.GEO_WITHIN, [val], this.fieldName);
        return this.and(command);
    }
    geoIntersects(val) {
        if (!(val.geometry instanceof index_1.Point) &&
            !(val.geometry instanceof index_1.LineString) &&
            !(val.geometry instanceof index_1.Polygon) &&
            !(val.geometry instanceof index_1.MultiPoint) &&
            !(val.geometry instanceof index_1.MultiLineString) &&
            !(val.geometry instanceof index_1.MultiPolygon)) {
            throw new TypeError(`"geometry" must be of type Point, LineString, Polygon, MultiPoint, MultiLineString or MultiPolygon. Received type ${typeof val.geometry}`);
        }
        const command = new QueryCommand(QUERY_COMMANDS_LITERAL.GEO_INTERSECTS, [val], this.fieldName);
        return this.and(command);
    }
}
exports.QueryCommand = QueryCommand;
function isQueryCommand(object) {
    return object && object instanceof QueryCommand && object._internalType === symbol_1.SYMBOL_QUERY_COMMAND;
}
exports.isQueryCommand = isQueryCommand;
function isKnownQueryCommand(object) {
    return isQueryCommand(object) && object.operator.toUpperCase() in QUERY_COMMANDS_LITERAL;
}
exports.isKnownQueryCommand = isKnownQueryCommand;
function isComparisonCommand(object) {
    return isQueryCommand(object);
}
exports.isComparisonCommand = isComparisonCommand;
exports.default = QueryCommand;

}, function(modId) { var map = {"./logic":1662121424081,"../helper/symbol":1662121424066,"../geo/index":1662121424060,"../utils/type":1662121424068}; return __REQUIRE__(map[modId], modId); })
__DEFINE__(1662121424081, function(require, module, exports) {

Object.defineProperty(exports, "__esModule", { value: true });
const symbol_1 = require("../helper/symbol");
const query_1 = require("./query");
exports.AND = 'and';
exports.OR = 'or';
exports.NOT = 'not';
exports.NOR = 'nor';
var LOGIC_COMMANDS_LITERAL;
(function (LOGIC_COMMANDS_LITERAL) {
    LOGIC_COMMANDS_LITERAL["AND"] = "and";
    LOGIC_COMMANDS_LITERAL["OR"] = "or";
    LOGIC_COMMANDS_LITERAL["NOT"] = "not";
    LOGIC_COMMANDS_LITERAL["NOR"] = "nor";
})(LOGIC_COMMANDS_LITERAL = exports.LOGIC_COMMANDS_LITERAL || (exports.LOGIC_COMMANDS_LITERAL = {}));
class LogicCommand {
    constructor(operator, operands, fieldName) {
        this._internalType = symbol_1.SYMBOL_LOGIC_COMMAND;
        Object.defineProperties(this, {
            _internalType: {
                enumerable: false,
                configurable: false,
            },
        });
        this.operator = operator;
        this.operands = operands;
        this.fieldName = fieldName || symbol_1.SYMBOL_UNSET_FIELD_NAME;
        if (this.fieldName !== symbol_1.SYMBOL_UNSET_FIELD_NAME) {
            if (Array.isArray(operands)) {
                operands = operands.slice();
                this.operands = operands;
                for (let i = 0, len = operands.length; i < len; i++) {
                    const query = operands[i];
                    if (isLogicCommand(query) || query_1.isQueryCommand(query)) {
                        operands[i] = query._setFieldName(this.fieldName);
                    }
                }
            }
            else {
                const query = operands;
                if (isLogicCommand(query) || query_1.isQueryCommand(query)) {
                    operands = query._setFieldName(this.fieldName);
                }
            }
        }
        /*
        Object.defineProperties(this, {
          operator: {
            configurable: true,
            enumerable: true,
            writable: false,
            value: operator,
          },
          operands: {
            configurable: true,
            enumerable: true,
            writable: false,
            value: operands,
          },
          fieldName: {
            configurable: true,
            enumerable: true,
            get() {
              return _fieldName
            },
            set(val) {
              _fieldName = val
            }
          }
        })
        */
    }
    _setFieldName(fieldName) {
        const operands = this.operands.map(operand => {
            if (operand instanceof LogicCommand) {
                return operand._setFieldName(fieldName);
            }
            else {
                return operand;
            }
        });
        const command = new LogicCommand(this.operator, operands, fieldName);
        return command;
    }
    /**
     * Support only command[] or ...command in v1
     * @param {(LogicCommand[]|object[]|...LogicCommand|...object)} expressions Command[] or ...Command
     */
    and(...__expressions__) {
        const expressions = Array.isArray(arguments[0]) ? arguments[0] : Array.from(arguments);
        expressions.unshift(this);
        return new LogicCommand(LOGIC_COMMANDS_LITERAL.AND, expressions, this.fieldName);
    }
    /**
     * Support only command[] or ...command in v1
     * @param {(LogicCommand[]|object[]|...LogicCommand|...object)} expressions Command[] or ...Command
     */
    or(...__expressions__) {
        const expressions = Array.isArray(arguments[0]) ? arguments[0] : Array.from(arguments);
        expressions.unshift(this);
        return new LogicCommand(LOGIC_COMMANDS_LITERAL.OR, expressions, this.fieldName);
    }
}
exports.LogicCommand = LogicCommand;
function isLogicCommand(object) {
    return object && (object instanceof LogicCommand) && (object._internalType === symbol_1.SYMBOL_LOGIC_COMMAND);
}
exports.isLogicCommand = isLogicCommand;
function isKnownLogicCommand(object) {
    return isLogicCommand && (object.operator.toUpperCase() in LOGIC_COMMANDS_LITERAL);
}
exports.isKnownLogicCommand = isKnownLogicCommand;
exports.default = LogicCommand;

}, function(modId) { var map = {"../helper/symbol":1662121424066,"./query":1662121424080}; return __REQUIRE__(map[modId], modId); })
__DEFINE__(1662121424082, function(require, module, exports) {

Object.defineProperty(exports, "__esModule", { value: true });
const query_1 = require("./commands/query");
const logic_1 = require("./commands/logic");
const update_1 = require("./commands/update");
exports.OperatorMap = {};
for (const key in query_1.QUERY_COMMANDS_LITERAL) {
    exports.OperatorMap[key] = '$' + key;
}
for (const key in logic_1.LOGIC_COMMANDS_LITERAL) {
    exports.OperatorMap[key] = '$' + key;
}
for (const key in update_1.UPDATE_COMMANDS_LITERAL) {
    exports.OperatorMap[key] = '$' + key;
}
// some exceptions
exports.OperatorMap[query_1.QUERY_COMMANDS_LITERAL.NEQ] = '$ne';
exports.OperatorMap[update_1.UPDATE_COMMANDS_LITERAL.REMOVE] = '$unset';
exports.OperatorMap[update_1.UPDATE_COMMANDS_LITERAL.SHIFT] = '$pop'; // same as POP
exports.OperatorMap[update_1.UPDATE_COMMANDS_LITERAL.UNSHIFT] = '$push'; // same as PUSH
function operatorToString(operator) {
    return exports.OperatorMap[operator] || '$' + operator;
}
exports.operatorToString = operatorToString;

}, function(modId) { var map = {"./commands/query":1662121424080,"./commands/logic":1662121424081,"./commands/update":1662121424077}; return __REQUIRE__(map[modId], modId); })
__DEFINE__(1662121424083, function(require, module, exports) {

Object.defineProperty(exports, "__esModule", { value: true });
const type_1 = require("../utils/type");
const datatype_1 = require("./datatype");
function flatten(query, shouldPreserverObject, parents, visited) {
    const cloned = Object.assign({}, query);
    for (const key in query) {
        if (/^\$/.test(key))
            continue;
        const value = query[key];
        if (!value)
            continue;
        if (type_1.isObject(value) && !shouldPreserverObject(value)) {
            if (visited.indexOf(value) > -1) {
                throw new Error('Cannot convert circular structure to JSON');
            }
            const newParents = [
                ...parents,
                key,
            ];
            const newVisited = [
                ...visited,
                value,
            ];
            const flattenedChild = flatten(value, shouldPreserverObject, newParents, newVisited);
            cloned[key] = flattenedChild;
            let hasKeyNotCombined = false;
            for (const childKey in flattenedChild) {
                if (!/^\$/.test(childKey)) {
                    cloned[`${key}.${childKey}`] = flattenedChild[childKey];
                    delete cloned[key][childKey];
                }
                else {
                    hasKeyNotCombined = true;
                }
            }
            if (!hasKeyNotCombined) {
                delete cloned[key];
            }
        }
    }
    return cloned;
}
function flattenQueryObject(query) {
    return flatten(query, isConversionRequired, [], [query]);
}
exports.flattenQueryObject = flattenQueryObject;
function flattenObject(object) {
    return flatten(object, (_) => false, [], [object]);
}
exports.flattenObject = flattenObject;
function mergeConditionAfterEncode(query, condition, key) {
    if (!condition[key]) {
        delete query[key];
    }
    for (const conditionKey in condition) {
        if (query[conditionKey]) {
            if (type_1.isArray(query[conditionKey])) {
                query[conditionKey].push(condition[conditionKey]);
            }
            else if (type_1.isObject(query[conditionKey])) {
                if (type_1.isObject(condition[conditionKey])) {
                    Object.assign(query[conditionKey], condition[conditionKey]);
                }
                else {
                    console.warn(`unmergable condition, query is object but condition is ${type_1.getType(condition)}, can only overwrite`, condition, key);
                    query[conditionKey] = condition[conditionKey];
                }
            }
            else {
                console.warn(`to-merge query is of type ${type_1.getType(query)}, can only overwrite`, query, condition, key);
                query[conditionKey] = condition[conditionKey];
            }
        }
        else {
            query[conditionKey] = condition[conditionKey];
        }
    }
}
exports.mergeConditionAfterEncode = mergeConditionAfterEncode;
/**
 * Check `val` if `InternalObject` | `Date` | `RegExp` | `ObjectId` | `isBinary`
 * InternalObject can be:  `LogicCommand` | `QueryCommand` | `UpdateCommand`
 *
 * @tip this method also used is `flatten()` function, `flatten` will reserved the required object
 * @param val
 * @returns
 */
function isConversionRequired(val) {
    return type_1.isInternalObject(val) || type_1.isDate(val) || type_1.isRegExp(val) || type_1.isObjectId(val) || type_1.isBinary(val);
}
exports.isConversionRequired = isConversionRequired;
function encodeInternalDataType(val) {
    return datatype_1.serialize(val);
}
exports.encodeInternalDataType = encodeInternalDataType;
function decodeInternalDataType(object) {
    return datatype_1.deserialize(object);
}
exports.decodeInternalDataType = decodeInternalDataType;

}, function(modId) { var map = {"../utils/type":1662121424068,"./datatype":1662121424076}; return __REQUIRE__(map[modId], modId); })
__DEFINE__(1662121424084, function(require, module, exports) {

Object.defineProperty(exports, "__esModule", { value: true });
const update_1 = require("../commands/update");
const symbol_1 = require("../helper/symbol");
const type_1 = require("../utils/type");
const operator_map_1 = require("../operator-map");
const common_1 = require("./common");
class UpdateSerializer {
    constructor() { }
    static encode(query) {
        const stringifier = new UpdateSerializer();
        return stringifier.encodeUpdate(query);
    }
    encodeUpdate(query) {
        if (update_1.isUpdateCommand(query)) {
            return this.encodeUpdateCommand(query);
        }
        else if (type_1.getType(query) === 'object') {
            return this.encodeUpdateObject(query);
        }
        else {
            return query;
        }
    }
    encodeUpdateCommand(query) {
        if (query.fieldName === symbol_1.SYMBOL_UNSET_FIELD_NAME) {
            throw new Error('Cannot encode a comparison command with unset field name');
        }
        switch (query.operator) {
            case update_1.UPDATE_COMMANDS_LITERAL.PUSH:
            case update_1.UPDATE_COMMANDS_LITERAL.PULL:
            case update_1.UPDATE_COMMANDS_LITERAL.PULL_ALL:
            case update_1.UPDATE_COMMANDS_LITERAL.POP:
            case update_1.UPDATE_COMMANDS_LITERAL.SHIFT:
            case update_1.UPDATE_COMMANDS_LITERAL.UNSHIFT:
            case update_1.UPDATE_COMMANDS_LITERAL.ADD_TO_SET: {
                return this.encodeArrayUpdateCommand(query);
            }
            default: {
                return this.encodeFieldUpdateCommand(query);
            }
        }
    }
    encodeFieldUpdateCommand(query) {
        const $op = operator_map_1.operatorToString(query.operator);
        switch (query.operator) {
            case update_1.UPDATE_COMMANDS_LITERAL.REMOVE: {
                return {
                    [$op]: {
                        [query.fieldName]: ''
                    }
                };
            }
            default: {
                return {
                    [$op]: {
                        [query.fieldName]: query.operands[0]
                    }
                };
            }
        }
    }
    encodeArrayUpdateCommand(query) {
        const $op = operator_map_1.operatorToString(query.operator);
        switch (query.operator) {
            case update_1.UPDATE_COMMANDS_LITERAL.PUSH: {
                let modifiers;
                if (type_1.isArray(query.operands)) {
                    modifiers = {
                        $each: query.operands.map(common_1.encodeInternalDataType)
                    };
                }
                else {
                    modifiers = query.operands;
                }
                return {
                    [$op]: {
                        [query.fieldName]: modifiers
                    }
                };
            }
            case update_1.UPDATE_COMMANDS_LITERAL.UNSHIFT: {
                const modifiers = {
                    $each: query.operands.map(common_1.encodeInternalDataType),
                    $position: 0
                };
                return {
                    [$op]: {
                        [query.fieldName]: modifiers
                    }
                };
            }
            case update_1.UPDATE_COMMANDS_LITERAL.POP: {
                return {
                    [$op]: {
                        [query.fieldName]: 1
                    }
                };
            }
            case update_1.UPDATE_COMMANDS_LITERAL.SHIFT: {
                return {
                    [$op]: {
                        [query.fieldName]: -1
                    }
                };
            }
            default: {
                return {
                    [$op]: {
                        [query.fieldName]: common_1.encodeInternalDataType(query.operands)
                    }
                };
            }
        }
    }
    encodeUpdateObject(query) {
        const flattened = common_1.flattenQueryObject(query);
        for (const key in flattened) {
            if (/^\$/.test(key))
                continue;
            let val = flattened[key];
            if (update_1.isUpdateCommand(val)) {
                flattened[key] = val._setFieldName(key);
                const condition = this.encodeUpdateCommand(flattened[key]);
                common_1.mergeConditionAfterEncode(flattened, condition, key);
            }
            else {
                // $set
                flattened[key] = val = common_1.encodeInternalDataType(val);
                const $setCommand = new update_1.UpdateCommand(update_1.UPDATE_COMMANDS_LITERAL.SET, [val], key);
                const condition = this.encodeUpdateCommand($setCommand);
                common_1.mergeConditionAfterEncode(flattened, condition, key);
            }
        }
        return flattened;
    }
}
exports.UpdateSerializer = UpdateSerializer;
/**

{
  a: {
    a1: _.set({ a11: 'test' }),
    a2: _.inc(10)
  },
}

=>

{
  a: {
    a1: $set({ a11: 'test' }),
    a2: $inc(10)
  }
}

=>

{
  'a.a1': $set({ a11: 'test' }),
  'a.a2': $inc(10)
}

=>

{
  $set: {
    'a.a1': {
      a11: 'test'
    }
  },
  $inc: {
    'a.a2': 10
  }
}

*/

}, function(modId) { var map = {"../commands/update":1662121424077,"../helper/symbol":1662121424066,"../utils/type":1662121424068,"../operator-map":1662121424082,"./common":1662121424083}; return __REQUIRE__(map[modId], modId); })
__DEFINE__(1662121424085, function(require, module, exports) {

Object.defineProperty(exports, "__esModule", { value: true });
const query_1 = require("./serializer/query");
const utils_1 = require("./utils/utils");
const type_1 = require("./utils/type");
const validate_1 = require("./validate");
const constant_1 = require("./constant");
const util_1 = require("./util");
const EARTH_RADIUS = 6378100;
class Aggregation {
    constructor(db, collectionName, rawPipeline) {
        this._stages = [];
        if (db && collectionName) {
            this._db = db;
            this._request = this._db.request;
            this._collectionName = collectionName;
            if (rawPipeline && rawPipeline.length > 0) {
                rawPipeline.forEach((stage) => {
                    validate_1.Validate.isValidAggregation(stage);
                    const stageName = Object.keys(stage)[0];
                    this._pipe(stageName, stage[stageName], true);
                });
            }
        }
    }
    async end() {
        var _a;
        if (!this._collectionName || !this._db) {
            throw new Error('Aggregation pipeline cannot send request');
        }
        if (!((_a = this._stages) === null || _a === void 0 ? void 0 : _a.length)) {
            throw new Error('Aggregation stage cannot be empty');
        }
        const res = await this._request.send(constant_1.ActionType.aggregate, {
            collectionName: this._collectionName,
            stages: this._stages
        });
        if (res.error) {
            return {
                error: res.error,
                data: res.data,
                requestId: res.requestId,
                ok: false,
                code: res.code
            };
        }
        const documents = util_1.Util.formatResDocumentData(res.data.list);
        const result = {
            data: documents,
            requestId: res.requestId,
            ok: true
        };
        return result;
    }
    unwrap() {
        return this._stages;
    }
    done() {
        return this._stages.map(({ stageKey, stageValue }) => {
            return {
                [stageKey]: JSON.parse(stageValue)
            };
        });
    }
    _pipe(stage, param, raw = false) {
        // 区分param是否为字符串
        let transformParam = '';
        if (type_1.getType(param) === 'object') {
            transformParam = utils_1.stringifyByEJSON(param);
        }
        else {
            transformParam = JSON.stringify(param);
        }
        this._stages.push({
            stageKey: raw ? stage : `$${stage}`,
            stageValue: transformParam
        });
        return this;
    }
    addFields(param) {
        return this._pipe('addFields', param);
    }
    bucket(param) {
        return this._pipe('bucket', param);
    }
    bucketAuto(param) {
        return this._pipe('bucketAuto', param);
    }
    count(param) {
        return this._pipe('count', param);
    }
    geoNear(param) {
        if (param.query) {
            param.query = query_1.QuerySerializer.encode(param.query);
        }
        // 判断是否有 distanceMultiplier 参数
        if (param.distanceMultiplier && typeof (param.distanceMultiplier) === 'number') {
            param.distanceMultiplier = param.distanceMultiplier * EARTH_RADIUS;
        }
        else {
            param.distanceMultiplier = EARTH_RADIUS;
        }
        return this._pipe('geoNear', param);
    }
    group(param) {
        return this._pipe('group', param);
    }
    limit(param) {
        return this._pipe('limit', param);
    }
    match(param) {
        return this._pipe('match', query_1.QuerySerializer.encode(param));
    }
    project(param) {
        return this._pipe('project', param);
    }
    lookup(param) {
        return this._pipe('lookup', param);
    }
    replaceRoot(param) {
        return this._pipe('replaceRoot', param);
    }
    sample(param) {
        return this._pipe('sample', param);
    }
    skip(param) {
        return this._pipe('skip', param);
    }
    sort(param) {
        return this._pipe('sort', param);
    }
    sortByCount(param) {
        return this._pipe('sortByCount', param);
    }
    unwind(param) {
        return this._pipe('unwind', param);
    }
}
exports.default = Aggregation;

}, function(modId) { var map = {"./serializer/query":1662121424079,"./utils/utils":1662121424086,"./utils/type":1662121424068,"./validate":1662121424062,"./constant":1662121424063,"./util":1662121424064}; return __REQUIRE__(map[modId], modId); })
__DEFINE__(1662121424086, function(require, module, exports) {

Object.defineProperty(exports, "__esModule", { value: true });
const bson_1 = require("bson");
const type_1 = require("./type");
exports.sleep = (ms = 0) => new Promise(r => setTimeout(r, ms));
const counters = {};
exports.autoCount = (domain = 'any') => {
    if (!counters[domain]) {
        counters[domain] = 0;
    }
    return counters[domain]++;
};
// 递归过滤对象中的undefiend字段
exports.filterUndefined = o => {
    // 如果不是对象类型，直接返回
    if (!type_1.isObject(o)) {
        return o;
    }
    for (let key in o) {
        if (o[key] === undefined) {
            delete o[key];
        }
        else if (type_1.isObject(o[key])) {
            o[key] = exports.filterUndefined(o[key]);
        }
    }
    return o;
};
exports.stringifyByEJSON = params => {
    // params中删除undefined的key
    params = exports.filterUndefined(params);
    return bson_1.EJSON.stringify(params, { relaxed: false });
};
exports.parseByEJSON = params => {
    return bson_1.EJSON.parse(params);
};

}, function(modId) { var map = {"./type":1662121424068}; return __REQUIRE__(map[modId], modId); })
__DEFINE__(1662121424087, function(require, module, exports) {

Object.defineProperty(exports, "__esModule", { value: true });
const query_1 = require("./commands/query");
const logic_1 = require("./commands/logic");
const update_1 = require("./commands/update");
const type_1 = require("./utils/type");
const aggregate_1 = require("./aggregate");
exports.Command = {
    eq(val) {
        return new query_1.QueryCommand(query_1.QUERY_COMMANDS_LITERAL.EQ, [val]);
    },
    neq(val) {
        return new query_1.QueryCommand(query_1.QUERY_COMMANDS_LITERAL.NEQ, [val]);
    },
    lt(val) {
        return new query_1.QueryCommand(query_1.QUERY_COMMANDS_LITERAL.LT, [val]);
    },
    lte(val) {
        return new query_1.QueryCommand(query_1.QUERY_COMMANDS_LITERAL.LTE, [val]);
    },
    gt(val) {
        return new query_1.QueryCommand(query_1.QUERY_COMMANDS_LITERAL.GT, [val]);
    },
    gte(val) {
        return new query_1.QueryCommand(query_1.QUERY_COMMANDS_LITERAL.GTE, [val]);
    },
    in(val) {
        return new query_1.QueryCommand(query_1.QUERY_COMMANDS_LITERAL.IN, val);
    },
    nin(val) {
        return new query_1.QueryCommand(query_1.QUERY_COMMANDS_LITERAL.NIN, val);
    },
    all(val) {
        return new query_1.QueryCommand(query_1.QUERY_COMMANDS_LITERAL.ALL, val);
    },
    elemMatch(val) {
        return new query_1.QueryCommand(query_1.QUERY_COMMANDS_LITERAL.ELEM_MATCH, [val]);
    },
    exists(val) {
        return new query_1.QueryCommand(query_1.QUERY_COMMANDS_LITERAL.EXISTS, [val]);
    },
    size(val) {
        return new query_1.QueryCommand(query_1.QUERY_COMMANDS_LITERAL.SIZE, [val]);
    },
    mod(val) {
        return new query_1.QueryCommand(query_1.QUERY_COMMANDS_LITERAL.MOD, [val]);
    },
    geoNear(val) {
        return new query_1.QueryCommand(query_1.QUERY_COMMANDS_LITERAL.GEO_NEAR, [val]);
    },
    geoWithin(val) {
        return new query_1.QueryCommand(query_1.QUERY_COMMANDS_LITERAL.GEO_WITHIN, [val]);
    },
    geoIntersects(val) {
        return new query_1.QueryCommand(query_1.QUERY_COMMANDS_LITERAL.GEO_INTERSECTS, [val]);
    },
    like(val) {
        return new query_1.QueryCommand(query_1.QUERY_COMMANDS_LITERAL.LIKE, [val]);
    },
    and(...__expressions__) {
        const expressions = type_1.isArray(arguments[0]) ? arguments[0] : Array.from(arguments);
        return new logic_1.LogicCommand(logic_1.LOGIC_COMMANDS_LITERAL.AND, expressions);
    },
    nor(...__expressions__) {
        const expressions = type_1.isArray(arguments[0]) ? arguments[0] : Array.from(arguments);
        return new logic_1.LogicCommand(logic_1.LOGIC_COMMANDS_LITERAL.NOR, expressions);
    },
    or(...__expressions__) {
        const expressions = type_1.isArray(arguments[0]) ? arguments[0] : Array.from(arguments);
        return new logic_1.LogicCommand(logic_1.LOGIC_COMMANDS_LITERAL.OR, expressions);
    },
    not(...__expressions__) {
        const expressions = type_1.isArray(arguments[0]) ? arguments[0] : Array.from(arguments);
        return new logic_1.LogicCommand(logic_1.LOGIC_COMMANDS_LITERAL.NOT, expressions);
    },
    set(val) {
        return new update_1.UpdateCommand(update_1.UPDATE_COMMANDS_LITERAL.SET, [val]);
    },
    remove() {
        return new update_1.UpdateCommand(update_1.UPDATE_COMMANDS_LITERAL.REMOVE, []);
    },
    inc(val) {
        return new update_1.UpdateCommand(update_1.UPDATE_COMMANDS_LITERAL.INC, [val]);
    },
    mul(val) {
        return new update_1.UpdateCommand(update_1.UPDATE_COMMANDS_LITERAL.MUL, [val]);
    },
    push(...args) {
        let values;
        if (type_1.isObject(args[0]) && args[0].hasOwnProperty('each')) {
            const options = args[0];
            values = {
                $each: options.each,
                $position: options.position,
                $sort: options.sort,
                $slice: options.slice
            };
        }
        else if (type_1.isArray(args[0])) {
            values = args[0];
        }
        else {
            values = Array.from(args);
        }
        return new update_1.UpdateCommand(update_1.UPDATE_COMMANDS_LITERAL.PUSH, values);
    },
    pull(values) {
        return new update_1.UpdateCommand(update_1.UPDATE_COMMANDS_LITERAL.PULL, values);
    },
    pullAll(values) {
        return new update_1.UpdateCommand(update_1.UPDATE_COMMANDS_LITERAL.PULL_ALL, values);
    },
    pop() {
        return new update_1.UpdateCommand(update_1.UPDATE_COMMANDS_LITERAL.POP, []);
    },
    shift() {
        return new update_1.UpdateCommand(update_1.UPDATE_COMMANDS_LITERAL.SHIFT, []);
    },
    unshift(...__values__) {
        const values = type_1.isArray(arguments[0]) ? arguments[0] : Array.from(arguments);
        return new update_1.UpdateCommand(update_1.UPDATE_COMMANDS_LITERAL.UNSHIFT, values);
    },
    addToSet(values) {
        return new update_1.UpdateCommand(update_1.UPDATE_COMMANDS_LITERAL.ADD_TO_SET, values);
    },
    rename(values) {
        return new update_1.UpdateCommand(update_1.UPDATE_COMMANDS_LITERAL.RENAME, [values]);
    },
    bit(values) {
        return new update_1.UpdateCommand(update_1.UPDATE_COMMANDS_LITERAL.BIT, [values]);
    },
    max(values) {
        return new update_1.UpdateCommand(update_1.UPDATE_COMMANDS_LITERAL.MAX, [values]);
    },
    min(values) {
        return new update_1.UpdateCommand(update_1.UPDATE_COMMANDS_LITERAL.MIN, [values]);
    },
    expr(values) {
        return {
            $expr: values
        };
    },
    jsonSchema(schema) {
        return {
            $jsonSchema: schema
        };
    },
    text(values) {
        if (type_1.isString(values)) {
            return {
                $search: values.search
            };
        }
        else {
            return {
                $search: values.search,
                $language: values.language,
                $caseSensitive: values.caseSensitive,
                $diacriticSensitive: values.diacriticSensitive
            };
        }
    },
    aggregate: {
        pipeline() {
            return new aggregate_1.default();
        },
        // https://docs.mongodb.com/manual/reference/operator/aggregation/
        // 算数操作符（15个）
        abs: (param) => new AggregationOperator('abs', param),
        add: (param) => new AggregationOperator('add', param),
        ceil: (param) => new AggregationOperator('ceil', param),
        divide: (param) => new AggregationOperator('divide', param),
        exp: (param) => new AggregationOperator('exp', param),
        floor: (param) => new AggregationOperator('floor', param),
        ln: (param) => new AggregationOperator('ln', param),
        log: (param) => new AggregationOperator('log', param),
        log10: (param) => new AggregationOperator('log10', param),
        mod: (param) => new AggregationOperator('mod', param),
        multiply: (param) => new AggregationOperator('multiply', param),
        pow: (param) => new AggregationOperator('pow', param),
        sqrt: (param) => new AggregationOperator('sqrt', param),
        subtract: (param) => new AggregationOperator('subtract', param),
        trunc: (param) => new AggregationOperator('trunc', param),
        // 数组操作符（15个）
        arrayElemAt: (param) => new AggregationOperator('arrayElemAt', param),
        arrayToObject: (param) => new AggregationOperator('arrayToObject', param),
        concatArrays: (param) => new AggregationOperator('concatArrays', param),
        filter: (param) => new AggregationOperator('filter', param),
        in: (param) => new AggregationOperator('in', param),
        indexOfArray: (param) => new AggregationOperator('indexOfArray', param),
        isArray: (param) => new AggregationOperator('isArray', param),
        map: (param) => new AggregationOperator('map', param),
        range: (param) => new AggregationOperator('range', param),
        reduce: (param) => new AggregationOperator('reduce', param),
        reverseArray: (param) => new AggregationOperator('reverseArray', param),
        size: (param) => new AggregationOperator('size', param),
        slice: (param) => new AggregationOperator('slice', param),
        zip: (param) => new AggregationOperator('zip', param),
        //布尔操作符（3个）
        and: (param) => new AggregationOperator('and', param),
        not: (param) => new AggregationOperator('not', param),
        or: (param) => new AggregationOperator('or', param),
        // 比较操作符（7个）
        cmp: (param) => new AggregationOperator('cmp', param),
        eq: (param) => new AggregationOperator('eq', param),
        gt: (param) => new AggregationOperator('gt', param),
        gte: (param) => new AggregationOperator('gte', param),
        lt: (param) => new AggregationOperator('lt', param),
        lte: (param) => new AggregationOperator('lte', param),
        neq: (param) => new AggregationOperator('ne', param),
        // 条件操作符（3个）
        cond: (param) => new AggregationOperator('cond', param),
        ifNull: (param) => new AggregationOperator('ifNull', param),
        switch: (param) => new AggregationOperator('switch', param),
        // 日期操作符（15个）
        dateFromParts: (param) => new AggregationOperator('dateFromParts', param),
        dateFromString: (param) => new AggregationOperator('dateFromString', param),
        dayOfMonth: (param) => new AggregationOperator('dayOfMonth', param),
        dayOfWeek: (param) => new AggregationOperator('dayOfWeek', param),
        dayOfYear: (param) => new AggregationOperator('dayOfYear', param),
        isoDayOfWeek: (param) => new AggregationOperator('isoDayOfWeek', param),
        isoWeek: (param) => new AggregationOperator('isoWeek', param),
        isoWeekYear: (param) => new AggregationOperator('isoWeekYear', param),
        millisecond: (param) => new AggregationOperator('millisecond', param),
        minute: (param) => new AggregationOperator('minute', param),
        month: (param) => new AggregationOperator('month', param),
        second: (param) => new AggregationOperator('second', param),
        hour: (param) => new AggregationOperator('hour', param),
        // 'toDate', 4.0才有
        week: (param) => new AggregationOperator('week', param),
        year: (param) => new AggregationOperator('year', param),
        // 字面操作符
        literal: (param) => new AggregationOperator('literal', param),
        // 对象操作符
        mergeObjects: (param) => new AggregationOperator('mergeObjects', param),
        objectToArray: (param) => new AggregationOperator('objectToArray', param),
        // 集合操作符（7个）
        allElementsTrue: (param) => new AggregationOperator('allElementsTrue', param),
        anyElementTrue: (param) => new AggregationOperator('anyElementTrue', param),
        setDifference: (param) => new AggregationOperator('setDifference', param),
        setEquals: (param) => new AggregationOperator('setEquals', param),
        setIntersection: (param) => new AggregationOperator('setIntersection', param),
        setIsSubset: (param) => new AggregationOperator('setIsSubset', param),
        setUnion: (param) => new AggregationOperator('setUnion', param),
        // 字符串操作符（13个）
        concat: (param) => new AggregationOperator('concat', param),
        dateToString: (param) => new AggregationOperator('dateToString', param),
        indexOfBytes: (param) => new AggregationOperator('indexOfBytes', param),
        indexOfCP: (param) => new AggregationOperator('indexOfCP', param),
        // 'ltrim',
        // 'rtrim',
        split: (param) => new AggregationOperator('split', param),
        strLenBytes: (param) => new AggregationOperator('strLenBytes', param),
        strLenCP: (param) => new AggregationOperator('strLenCP', param),
        strcasecmp: (param) => new AggregationOperator('strcasecmp', param),
        substr: (param) => new AggregationOperator('substr', param),
        substrBytes: (param) => new AggregationOperator('substrBytes', param),
        substrCP: (param) => new AggregationOperator('substrCP', param),
        toLower: (param) => new AggregationOperator('toLower', param),
        // 'toString'
        // 'trim'
        toUpper: (param) => new AggregationOperator('toUpper', param),
        // 文本操作符
        meta: (param) => new AggregationOperator('meta', param),
        // group操作符（10个）
        addToSet: (param) => new AggregationOperator('addToSet', param),
        avg: (param) => new AggregationOperator('avg', param),
        first: (param) => new AggregationOperator('first', param),
        last: (param) => new AggregationOperator('last', param),
        max: (param) => new AggregationOperator('max', param),
        min: (param) => new AggregationOperator('min', param),
        push: (param) => new AggregationOperator('push', param),
        stdDevPop: (param) => new AggregationOperator('stdDevPop', param),
        stdDevSamp: (param) => new AggregationOperator('stdDevSamp', param),
        sum: (param) => new AggregationOperator('sum', param),
        // 变量声明操作符
        let: (param) => new AggregationOperator('let', param)
    },
    project: {
        slice: (param) => new ProjectionOperator('slice', param),
        elemMatch: (param) => new ProjectionOperator('elemMatch', param)
    }
};
class AggregationOperator {
    constructor(name, param) {
        this['$' + name] = param;
    }
}
class ProjectionOperator {
    constructor(name, param) {
        this['$' + name] = param;
    }
}
exports.default = exports.Command;

}, function(modId) { var map = {"./commands/query":1662121424080,"./commands/logic":1662121424081,"./commands/update":1662121424077,"./utils/type":1662121424068,"./aggregate":1662121424085}; return __REQUIRE__(map[modId], modId); })
__DEFINE__(1662121424088, function(require, module, exports) {

Object.defineProperty(exports, "__esModule", { value: true });
const symbol_1 = require("../helper/symbol");
/**
 * @deprecated This method was deprecated, use js native `RegExp` instead
 */
class RegExp {
    constructor({ regexp, options }) {
        if (!regexp) {
            throw new TypeError('regexp must be a string');
        }
        this.$regex = regexp;
        this.$options = options || '';
    }
    parse() {
        return {
            $regex: this.$regex,
            $options: this.$options
        };
    }
    get _internalType() {
        return symbol_1.SYMBOL_REGEXP;
    }
}
exports.RegExp = RegExp;
/**
 * @deprecated This method was deprecated, use js native `RegExp` instead
 * @param param
 * @returns
 */
function RegExpConstructor(param) {
    return new RegExp(param);
}
exports.RegExpConstructor = RegExpConstructor;

}, function(modId) { var map = {"../helper/symbol":1662121424066}; return __REQUIRE__(map[modId], modId); })
return __REQUIRE__(1662121424059);
})()
//miniprogram-npm-outsideDeps=["bson"]
//# sourceMappingURL=index.js.map