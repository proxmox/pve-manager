Ext.define('PVE.form.EmailNotificationSelector', {
    extend: 'PVE.form.KVComboBox',
    alias: ['widget.pveEmailNotificationSelector'],

    initComponent: function() {
        var me = this;

        me.data = [
            ['always', gettext('Always')],
            ['failure', gettext('On failure only')]
        ];

        me.callParent();
    }
});
