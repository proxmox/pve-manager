// ExtJS related things

Proxmox.Utils.toolkit = 'extjs';

// custom PVE specific VTypes
Ext.apply(Ext.form.field.VTypes, {

    QemuStartDate: function(v) {
	return (/^(now|\d{4}-\d{1,2}-\d{1,2}(T\d{1,2}:\d{1,2}:\d{1,2})?)$/).test(v);
    },
    QemuStartDateText: gettext('Format') + ': "now" or "2006-06-17T16:01:21" or "2006-06-17"'

});
