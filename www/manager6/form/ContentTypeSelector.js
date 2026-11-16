Ext.define('PVE.form.ContentTypeSelector', {
    extend: 'Proxmox.form.KVComboBox',
    alias: ['widget.pveContentTypeSelector'],

    cts: undefined,

    withVolumeTypes: true,

    initComponent: function () {
        var me = this;

        me.comboItems = [];

        if (me.cts === undefined) {
            me.cts = ['images', 'iso', 'vztmpl', 'backup', 'rootdir', 'snippets', 'import'];
        }

        if (me.withVolumeTypes) {
            let generic = PVE.Utils.genericContentType;
            me.cts = me.cts.flatMap((ct) => [
                ct,
                ...Object.keys(generic).filter((vtype) => generic[vtype] === ct),
            ]);
        }

        Ext.Array.each(me.cts, function (ct) {
            me.comboItems.push([ct, PVE.Utils.format_content_types(ct)]);
        });

        me.callParent();
    },
});
