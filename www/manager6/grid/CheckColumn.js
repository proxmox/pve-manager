
// partly copied from extjs/examples/ux/CheckColumn.js

Ext.define('PVE.CheckColumn', {
    extend: 'Ext.grid.column.Column',
    alias: 'widget.checkcolumn',

    constructor: function(cfg) {
	this.renderer = function(value){
            var cssPrefix = Ext.baseCSSPrefix,
            cls = [cssPrefix + 'grid-checkheader'];

            if (value) {
		cls.push(cssPrefix + 'grid-checkheader-checked');
            }
            return '<div class="' + cls.join(' ') + '">&#160;</div>';
	};

	this.addEvents('checkchange');

        this.callParent(arguments);
    },

    processEvent: function(type, view, cell, recordIndex, cellIndex, e) {
        if (type == 'mousedown') {
            var record = view.panel.store.getAt(recordIndex),
                dataIndex = this.dataIndex,
                checked = !record.get(dataIndex);
            record.set(dataIndex, checked);
            this.fireEvent('checkchange', this, record, checked);
            return false;
        } else {
            return this.callParent(arguments);
        }
    }

});

