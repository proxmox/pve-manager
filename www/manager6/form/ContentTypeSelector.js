Ext.define('PVE.form.ContentTypeSelector', {
    extend: 'Proxmox.form.KVComboBox',
    alias: ['widget.pveContentTypeSelector'],

    cts: undefined,

    withVolumeTypes: true,

    // The volume types of guests are easy to mix up with the generic type that allows them, so
    // they are only offered on request or if the storage uses one already.
    showVolumeTypes: false,

    statics: {
        // The label of a type in the list. For a generic type it says what the type stands for
        // while its volume types are offered too.
        listLabel: function (label, key, items) {
            let generic = PVE.Utils.genericContentType;
            if (!items.some((item) => generic[item.key] === key)) {
                return label;
            }
            if (key === 'images') {
                // TRANSLATORS: {0} is the content type 'Disk image', it allows all VM volume types
                return Ext.String.format(gettext('{0} (all VM)'), label);
            }
            // TRANSLATORS: {0} is the content type 'Container', it allows all CT volume types
            return Ext.String.format(gettext('{0} (all CT)'), label);
        },
    },

    comboItemsFor: function (withVolumeTypes) {
        let me = this;

        let cts = me.cts;
        if (me.withVolumeTypes && withVolumeTypes) {
            let generic = PVE.Utils.genericContentType;
            cts = cts.flatMap((ct) => [
                ct,
                ...Object.keys(generic).filter((vtype) => generic[vtype] === ct),
            ]);
        }
        return cts.map((ct) => [ct, PVE.Utils.format_content_types(ct)]);
    },

    usesVolumeType: (value) =>
        Ext.Array.from(value).some((ct) => PVE.Utils.genericContentType[ct] !== undefined),

    setShowVolumeTypes: function (show) {
        let me = this;

        me.showVolumeTypes = show;

        let value = me.getValue();
        me.setComboItems(me.comboItemsFor(show || me.usesVolumeType(value)));
        me.setValue(value);
    },

    setValue: function (value) {
        let me = this;

        let hasVolumeTypes = me.getStore().findBy((rec) => me.usesVolumeType(rec.data.key)) !== -1;
        if (me.withVolumeTypes && me.usesVolumeType(value) && !hasVolumeTypes) {
            me.setComboItems(me.comboItemsFor(true));
        }

        return me.callParent([value]);
    },

    initComponent: function () {
        var me = this;

        if (me.cts === undefined) {
            me.cts = ['images', 'iso', 'vztmpl', 'backup', 'rootdir', 'snippets', 'import'];
        }

        me.comboItems = me.comboItemsFor(me.showVolumeTypes || me.usesVolumeType(me.value));

        if (me.withVolumeTypes) {
            let listLabel = 'PVE.form.ContentTypeSelector.listLabel';
            me.listConfig = {
                getInnerTpl: (field) => `{[${listLabel}(values.${field}, values.key, parent)]}`,
                ...me.listConfig,
            };
        }

        me.callParent();
    },
});
