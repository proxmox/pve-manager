Ext.define('PVE.form.Textfield', {
    extend: 'Ext.form.field.Text',
    alias: ['widget.pvetextfield'],

    skipEmptyText: true,
    
    deleteEmpty: false,
    
    getSubmitData: function() {
        var me = this,
            data = null,
            val;
        if (!me.disabled && me.submitValue && !me.isFileUpload()) {
            val = me.getSubmitValue();
            if (val !== null) {
                data = {};
                data[me.getName()] = val;
            } else if (me.deleteEmpty) {
		data = {};
                data['delete'] = me.getName();
	    }
        }
        return data;
    },

    getSubmitValue: function() {
	var me = this;

        var value = this.processRawValue(this.getRawValue());
	if (value !== '') {
	    return value;
	}

	return me.skipEmptyText ? null: value; 
    }
});