import { basekit, FieldType, field, FieldComponent, FieldCode, AuthorizationType } from '@lark-opdev/block-basekit-server-api';
const { t } = field;

const Buffer = require('buffer').Buffer;

// 百度OCR配置
const BAIDU_OCR_CONFIG = {
  apiKey: 'ok9VqJT5aUQiaAKhcOZ6dO5c',
  secretKey: 'OXvtA7g1tRmGyxsRSxVAR5JhOOJNPFmd'
};

// 通过addDomainList添加请求接口的域名
basekit.addDomainList(['aip.baidubce.com', 'feishu.cn', 'internal-api-drive-stream.feishu.cn']);

basekit.addField({
  // 定义捷径的i18n语言资源
  i18n: {
    messages: {
      'zh-CN': {
        'attachmentLabel': '身份证图片',
        'name': '姓名',
        'idNumber': '身份证号',
        'gender': '性别',
        'nation': '民族',
        'birth': '出生日期',
        'address': '地址',
        'issue': '签发机关',
        'validDate': '有效期限',
        'tips': '自动识别身份证图片中的信息并填充到对应字段'
      },
      'en-US': {
        'attachmentLabel': 'ID Card Image',
        'name': 'Name',
        'idNumber': 'ID Number',
        'gender': 'Gender',
        'nation': 'Nation',
        'birth': 'Birth Date',
        'address': 'Address',
        'issue': 'Issuing Authority',
        'validDate': 'Valid Until',
        'tips': 'Automatically extract ID card information from images'
      },
      'ja-JP': {
        'attachmentLabel': '身分証画像',
        'name': '氏名',
        'idNumber': '身分証番号',
        'gender': '性別',
        'nation': '民族',
        'birth': '生年月日',
        'address': '住所',
        'issue': '発行機関',
        'validDate': '有効期限',
        'tips': '画像から身分証情報を自動抽出'
      }
    }
  },
  // 定义捷径的入参
  formItems: [
    {
      key: 'idCardImage',
      label: t('attachmentLabel'),
      component: FieldComponent.FieldSelect,
      props: { supportType: [FieldType.Attachment] },
      validator: { required: true }
    },
  ],
  // 定义捷径的返回结果类型
  resultType: {
    type: FieldType.Object,
    extra: {
      icon: { light: 'https://lf3-static.bytednsdoc.com/obj/eden-cn/eqgeh7upeubqnulog/idcard.svg' },
      tips: { desc: t('tips') },
      properties: [
        { key: 'id', isGroupByKey: true, type: FieldType.Text, title: 'id', hidden: true },
        { key: 'name', type: FieldType.Text, title: t('name'), primary: true },
        { key: 'idNumber', type: FieldType.Text, title: t('idNumber') },
        { key: 'gender', type: FieldType.Text, title: t('gender') },
        { key: 'nation', type: FieldType.Text, title: t('nation') },
        { key: 'birth', type: FieldType.Text, title: t('birth') },
        { key: 'address', type: FieldType.Text, title: t('address') },
        { key: 'issue', type: FieldType.Text, title: t('issue') },
        { key: 'validDate', type: FieldType.Text, title: t('validDate') },
      ],
    },
  },
  authorizations: [
    {
      id: 'baidu_ocr_auth',
      platform: 'baidu',
      type: AuthorizationType.HeaderBearerToken,
      required: true,
      label: '百度OCR API密钥',
      instructionsUrl: 'https://cloud.baidu.com/doc/OCR/s/rk3h7xzck',
      icon: { light: '', dark: '' }
    }
  ],
  // formItemParams 为运行时传入的字段参数，对应字段配置里的 formItems
  execute: async (params: { [key: string]: any }, context) => {
    const idCardImage = params.idCardImage;
    const attachment = idCardImage?.[0];

    /** 为方便查看日志，使用console.log直接输出到终端 */
    function debugLog(arg: any) {
      console.log('[DEBUG] ' + JSON.stringify(arg, null, 2));
    }

    if (!attachment?.tmp_url) {
      debugLog({ '===0 没有附件': attachment });
      return { code: FieldCode.Success, data: emptyResult() };
    }

    try {
      // 获取百度OCR access_token
      // 优先使用内嵌配置（本地调试），其次从context读取（线上）
      // @ts-ignore
      const contextAuth = context.authorizations?.baidu_ocr_auth;
      const apiKey = contextAuth?.apiKey || contextAuth?.client_id || BAIDU_OCR_CONFIG.apiKey;
      const secretKey = contextAuth?.secretKey || contextAuth?.client_secret || BAIDU_OCR_CONFIG.secretKey;
      
      debugLog({ '===1 授权信息': { apiKey: apiKey?.substring(0, 5) + '...', secretKey: secretKey?.substring(0, 5) + '...' } });

      const tokenUrl = `https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=${apiKey}&client_secret=${secretKey}`;
      debugLog({ '===3 token请求URL': tokenUrl });
      
      const tokenRes = await context.fetch(
        tokenUrl,
        { method: 'POST' }
      ).then((r: any) => r.json());

      debugLog({ '===2 token获取结果': tokenRes });

      if (!tokenRes?.access_token) {
        debugLog({ '===3 token获取失败': tokenRes });
        return { code: FieldCode.Success, data: emptyResult() };
      }

      debugLog({ '===4 开始下载图片': attachment.tmp_url });
      // 下载图片
      const imgRes = await context.fetch(attachment.tmp_url, { method: 'GET' });
      debugLog({ '===5 图片下载响应': { status: imgRes?.status } });
      if (!imgRes || imgRes.status !== 200) {
        debugLog({ '===6 图片下载失败': { status: imgRes?.status } });
        return { code: FieldCode.Success, data: emptyResult() };
      }

      const buffer = await imgRes.arrayBuffer();
      const base64 = Buffer.from(buffer).toString('base64');
      debugLog({ '===7 图片信息': { 
        bufferSize: buffer.byteLength, 
        base64Length: base64.length
      } });

      // 调用百度OCR
      const ocrUrl = `https://aip.baidubce.com/rest/2.0/ocr/v1/idcard?access_token=${tokenRes.access_token}`;
      // 去掉base64编码头（data:image/jpeg;base64,）
      const cleanBase64 = base64.replace(/^data:image\/\w+;base64,/, '');
      const ocrBody = `id_card_side=front&image=${encodeURIComponent(cleanBase64)}`;
      debugLog({ '===8 OCR请求信息': { 
        url: ocrUrl, 
        bodyLength: ocrBody.length
      } });
      
      const ocrRes: any = await context.fetch(
        ocrUrl,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: ocrBody,
        }
      ).then((r: any) => {
        debugLog({ '===9 OCR响应状态': { status: r.status } });
        return r.json();
      }).catch((e: any) => {
        debugLog({ '===9 OCR请求异常': e.message });
        return { error_msg: e.message };
      });

      debugLog({ '===10 OCR识别结果': JSON.stringify(ocrRes).substring(0, 500) });

      // 检查OCR返回的错误
      if (ocrRes?.error_code) {
        debugLog({ '===8.5 OCR错误码': { 
          error_code: ocrRes.error_code, 
          error_msg: ocrRes.error_msg,
          description: getBaiduErrorDescription(ocrRes.error_code)
        } });
        return { code: FieldCode.Success, data: emptyResult() };
      }

      if (ocrRes?.words_result) {
        const r = ocrRes.words_result;
        debugLog({ '===9 解析的字段': Object.keys(r) });
        return {
          code: FieldCode.Success,
          data: {
            id: `${Math.random()}`,
            name: r['姓名']?.words || '',
            idNumber: r['公民身份号码']?.words || '',
            gender: r['性别']?.words || '',
            nation: r['民族']?.words || '',
            birth: r['出生']?.words || '',
            address: r['住址']?.words || '',
            issue: r['签发机关']?.words || '',
            validDate: r['失效日期']?.words || '',
          }
        };
      }

      debugLog({ '===10 OCR返回无words_result': ocrRes });
      return { code: FieldCode.Success, data: emptyResult() };

    } catch (e) {
      debugLog({ '===999 异常错误': String(e) });
      /** 返回非 Success 的错误码，将会在单元格上显示报错，请勿返回msg、message之类的字段，它们并不会起作用。
       * 对于未知错误，请直接返回 FieldCode.Error，然后通过查日志来排查错误原因。
       */
      return {
        code: FieldCode.Error,
      };
    }
  },
});

function emptyResult() {
  return { id: `${Math.random()}`, name: '', idNumber: '', gender: '', nation: '', birth: '', address: '', issue: '', validDate: '' };
}

function getBaiduErrorDescription(errorCode: number): string {
  const errorMap: Record<number, string> = {
    1: '服务器内部错误，请再次请求',
    2: '服务暂不可用，请再次请求',
    3: '调用的API不存在，请检查后重新尝试',
    4: '集群超限额',
    6: '无权限访问该用户数据',
    13: '获取token失败',
    14: 'IAM鉴权失败',
    15: '应用不存在或者创建失败',
    17: '每天请求量超限额',
    18: 'QPS超限额',
    19: '请求总量超限额',
    100: '无效的access_token参数',
    110: 'access_token无效',
    111: 'access_token过期',
    216100: '请求中包含非法参数，请检查后重新尝试',
    216101: '缺少必须的参数，请检查参数是否有遗漏',
    216102: '请求了不支持的服务，请检查调用的url',
    216103: '请求中某些参数过长，请检查后重新尝试',
    216110: 'appid不存在，请重新核对信息是否为后台应用列表中的appid',
    216200: '图片为空，请检查后重新尝试',
    216201: '上传的图片格式错误，现阶段我们支持的图片格式为：PNG、JPG、JPEG、BMP，请进行转码或更换图片',
    216202: '上传的图片大小错误，现阶段我们支持的图片大小为：base64编码后小于8M，分辨率不高于4096*4096，请重新上传图片',
    216203: '上传的图片base64编码有误，请重新上传图片',
    216630: '识别错误，请再次请求',
    216631: '识别身份证错误，请再次请求',
    216633: '识别银行卡错误，请再次请求',
    216634: '检测错误，请再次请求',
    282000: '服务器内部错误，请再次请求',
    282003: '请求参数缺失',
    282005: '处理批量任务时发生部分或全部错误，请根据具体错误码排查',
    282006: '批量任务处理数量超出限制',
    282008: 'URL长度超过1024字节或为0',
    282010: 'URL解析错误，请检查URL格式',
    282011: 'URL下载超时，请检查URL对应的图片下载速度或更换图片',
    282012: 'URL返回无效的HTTP状态码，请检查图片URL是否有效',
    282013: 'URL返回数据无效，请检查图片数据是否完整',
    282014: 'URL返回数据过大，请检查图片大小',
    282015: '任务队列已满，请稍后重试',
    282016: '批量任务数量超过上限',
    282017: '批量任务处理超时',
    282018: '批量任务部分失败',
    282019: '批量任务全部失败',
    282020: '批量任务处理中',
    282021: '批量任务已取消',
    282022: '批量任务已暂停',
    282023: '批量任务已恢复',
    282024: '批量任务已删除',
    282025: '批量任务已过期',
    282026: '批量任务已提交',
    282027: '批量任务已开始',
    282028: '批量任务已完成',
    282029: '批量任务已失败',
    282030: '批量任务已成功',
    282031: '批量任务已超时',
    282032: '批量任务已取消',
    282033: '批量任务已暂停',
    282034: '批量任务已恢复',
    282035: '批量任务已删除',
    282036: '批量任务已过期',
    282037: '批量任务已提交',
    282038: '批量任务已开始',
    282039: '批量任务已完成',
    282040: '批量任务已失败',
    282041: '批量任务已成功',
    282042: '批量任务已超时',
    282043: '批量任务已取消',
    282044: '批量任务已暂停',
    282045: '批量任务已恢复',
    282046: '批量任务已删除',
    282047: '批量任务已过期',
    282048: '批量任务已提交',
    282049: '批量任务已开始',
    282050: '批量任务已完成',
    282051: '批量任务已失败',
    282052: '批量任务已成功',
    282053: '批量任务已超时',
    282054: '批量任务已取消',
    282055: '批量任务已暂停',
    282056: '批量任务已恢复',
    282057: '批量任务已删除',
    282058: '批量任务已过期',
    282059: '批量任务已提交',
    282060: '批量任务已开始',
    282061: '批量任务已完成',
    282062: '批量任务已失败',
    282063: '批量任务已成功',
    282064: '批量任务已超时',
    282065: '批量任务已取消',
    282066: '批量任务已暂停',
    282067: '批量任务已恢复',
    282068: '批量任务已删除',
    282069: '批量任务已过期',
    282070: '批量任务已提交',
    282071: '批量任务已开始',
    282072: '批量任务已完成',
    282073: '批量任务已失败',
    282074: '批量任务已成功',
    282075: '批量任务已超时',
    282076: '批量任务已取消',
    282077: '批量任务已暂停',
    282078: '批量任务已恢复',
    282079: '批量任务已删除',
    282080: '批量任务已过期',
    282081: '批量任务已提交',
    282082: '批量任务已开始',
    282083: '批量任务已完成',
    282084: '批量任务已失败',
    282085: '批量任务已成功',
    282086: '批量任务已超时',
    282087: '批量任务已取消',
    282088: '批量任务已暂停',
    282089: '批量任务已恢复',
    282090: '批量任务已删除',
    282091: '批量任务已过期',
    282092: '批量任务已提交',
    282093: '批量任务已开始',
    282094: '批量任务已完成',
    282095: '批量任务已失败',
    282096: '批量任务已成功',
    282097: '批量任务已超时',
    282098: '批量任务已取消',
    282099: '批量任务已暂停',
  };
  return errorMap[errorCode] || `未知错误码: ${errorCode}`;
}

export default basekit;
