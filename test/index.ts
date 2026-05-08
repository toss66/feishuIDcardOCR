import { testField, createFieldContext, FieldContext } from "@lark-opdev/block-basekit-server-api";

async function run() {
    const context = await createFieldContext() as FieldContext;
    testField({
        idCardImages: [
            {
                tmp_url: 'https://example.com/idcard-front.jpg',
                name: 'idcard-front.jpg'
            },
            {
                tmp_url: 'https://example.com/idcard-back.jpg',
                name: 'idcard-back.jpg'
            }
        ],
    }, context);
}

run();
