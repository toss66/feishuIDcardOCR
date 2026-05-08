import { basekit, FieldType, field, FieldComponent, FieldCode, AuthorizationType } from '@lark-opdev/block-basekit-server-api';
const { t } = field;

const Buffer = require('buffer').Buffer;

basekit.addDomainList(['aip.baidubce.com', 'feishu.cn', 'internal-api-drive-stream.feishu.cn']);

basekit.addField({
  i18n: {
    messages: {
      'zh-CN': {
        'attachmentLabel': '身份证图片',
        'attachmentTip': '支持上传正面、反面或正反面多张图片',
        'name': '姓名',
        'idNumber': '身份证号',
        'gender': '性别',
        'nation': '民族',
        'birth': '出生日期',
        'address': '地址',
        'issue': '签发机关',
        'validDateStart': '有效期限(开始)',
        'validDateEnd': '有效期限(结束)',
        'tips': '自动识别身份证正反面图片中的信息并合并输出'
      },
      'en-US': {
        'attachmentLabel': 'ID Card Images',
        'attachmentTip': 'Support front, back or both sides images',
        'name': 'Name',
        'idNumber': 'ID Number',
        'gender': 'Gender',
        'nation': 'Nation',
        'birth': 'Birth Date',
        'address': 'Address',
        'issue': 'Issuing Authority',
        'validDateStart': 'Valid From',
        'validDateEnd': 'Valid Until',
        'tips': 'Automatically extract ID card information from front and back images'
      },
      'ja-JP': {
        'attachmentLabel': '身分証画像',
        'attachmentTip': '表面、裏面または両方の画像をサポート',
        'name': '氏名',
        'idNumber': '身分証番号',
        'gender': '性別',
        'nation': '民族',
        'birth': '生年月日',
        'address': '住所',
        'issue': '発行機関',
        'validDateStart': '有効期間(開始)',
        'validDateEnd': '有効期間(終了)',
        'tips': '身分証の表面と裏面の画像から情報を自動抽出'
      }
    }
  },
  formItems: [
    {
      key: 'idCardImages',
      label: t('attachmentLabel'),
      component: FieldComponent.FieldSelect,
      props: { supportType: [FieldType.Attachment], multiple: true },
      validator: { required: true }
    },
  ],
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
        { key: 'validDateStart', type: FieldType.Text, title: t('validDateStart') },
        { key: 'validDateEnd', type: FieldType.Text, title: t('validDateEnd') },
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
  execute: async (params: { [key: string]: any }, context) => {
    const idCardImages = params.idCardImages;

    function debugLog(arg: any) {
      console.log('[DEBUG] ' + JSON.stringify(arg, null, 2));
    }

    if (!idCardImages || idCardImages.length === 0) {
      debugLog({ '===0 没有附件': idCardImages });
      return { code: FieldCode.Success, data: emptyResult() };
    }

    try {
      // @ts-ignore
      const contextAuth = context.authorizations?.baidu_ocr_auth;
      const apiKey = contextAuth?.apiKey || contextAuth?.client_id || 'ok9VqJT5aUQiaAKhcOZ6dO5c';
      const secretKey = contextAuth?.secretKey || contextAuth?.client_secret || 'OXvtA7g1tRmGyxsRSxVAR5JhOOJNPFmd';

      if (!apiKey || !secretKey) {
        debugLog({ '===1 缺少授权信息': { hasApiKey: !!apiKey, hasSecretKey: !!secretKey } });
        return { code: FieldCode.Error };
      }

      const tokenUrl = `https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=${apiKey}&client_secret=${secretKey}`;
      const tokenRes = await context.fetch(tokenUrl, { method: 'POST' }).then((r: any) => r.json());

      if (!tokenRes?.access_token) {
        debugLog({ '===2 token获取失败': tokenRes });
        return { code: FieldCode.Error };
      }

      const accessToken = tokenRes.access_token;
      const mergedData: any = {};
      let hasFrontResult = false;
      let hasBackResult = false;

      for (let i = 0; i < idCardImages.length; i++) {
        const attachment = idCardImages[i];
        if (!attachment?.tmp_url) {
          continue;
        }

        debugLog({ [`处理图片 ${i + 1}/${idCardImages.length}`]: attachment.tmp_url });

        const imgRes = await context.fetch(attachment.tmp_url, { method: 'GET' });
        if (!imgRes || imgRes.status !== 200) {
          debugLog({ [`图片 ${i + 1} 下载失败`]: { status: imgRes?.status } });
          continue;
        }

        const buffer = await imgRes.arrayBuffer();
        const base64 = Buffer.from(buffer).toString('base64');
        const cleanBase64 = base64.replace(/^data:image\/\w+;base64,/, '');

        const ocrUrl = `https://aip.baidubce.com/rest/2.0/ocr/v1/idcard?access_token=${accessToken}`;

        debugLog({ [`识别正面 ${i + 1}`]: ocrUrl });
        const frontBody = `id_card_side=front&image=${encodeURIComponent(cleanBase64)}`;
        const frontRes: any = await context.fetch(
          ocrUrl,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: frontBody,
          }
        ).then((r: any) => r.json());

        if (frontRes?.words_result && !frontRes?.error_code) {
          debugLog({ [`正面识别成功 ${i + 1}`]: Object.keys(frontRes.words_result) });
          const r = frontRes.words_result;
          if (r['姓名']?.words) mergedData.name = r['姓名'].words;
          if (r['公民身份号码']?.words) mergedData.idNumber = r['公民身份号码'].words;
          if (r['性别']?.words) mergedData.gender = r['性别'].words;
          if (r['民族']?.words) mergedData.nation = r['民族'].words;
          if (r['出生']?.words) mergedData.birth = r['出生'].words;
          if (r['住址']?.words) mergedData.address = r['住址'].words;
          hasFrontResult = true;
        }

        debugLog({ [`识别反面 ${i + 1}`]: ocrUrl });
        const backBody = `id_card_side=back&image=${encodeURIComponent(cleanBase64)}`;
        const backRes: any = await context.fetch(
          ocrUrl,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: backBody,
          }
        ).then((r: any) => r.json());

        if (backRes?.words_result && !backRes?.error_code) {
          debugLog({ [`反面识别成功 ${i + 1}`]: Object.keys(backRes.words_result) });
          const r = backRes.words_result;
          if (r['签发机关']?.words) mergedData.issue = r['签发机关'].words;
          if (r['签发日期']?.words) mergedData.validDateStart = r['签发日期'].words;
          if (r['失效日期']?.words) mergedData.validDateEnd = r['失效日期'].words;
          hasBackResult = true;
        }
      }

      if (!hasFrontResult && !hasBackResult) {
        debugLog({ '===9 所有图片识别失败': idCardImages.length });
        return { code: FieldCode.Success, data: emptyResult() };
      }

      debugLog({ '===10 最终合并结果': { hasFrontResult, hasBackResult, data: mergedData } });

      return {
        code: FieldCode.Success,
        data: {
          id: `${Math.random()}`,
          name: mergedData.name || '',
          idNumber: mergedData.idNumber || '',
          gender: mergedData.gender || '',
          nation: mergedData.nation || '',
          birth: mergedData.birth || '',
          address: mergedData.address || '',
          issue: mergedData.issue || '',
          validDateStart: mergedData.validDateStart || '',
          validDateEnd: mergedData.validDateEnd || '',
        }
      };

    } catch (e) {
      debugLog({ '===999 异常错误': String(e) });
      return {
        code: FieldCode.Error,
      };
    }
  },
});

function emptyResult() {
  return { id: `${Math.random()}`, name: '', idNumber: '', gender: '', nation: '', birth: '', address: '', issue: '', validDateStart: '', validDateEnd: '' };
}

export default basekit;
